(function () {
  function createLmsRuntimeApi(params) {
    var attemptId = null;
    var authToken = params.token;
    var apiBase = params.apiBase;

    async function request(path, options) {
      var response = await fetch(apiBase + path, {
        method: options && options.method ? options.method : "GET",
        keepalive: options && options.keepalive ? true : false,
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + authToken,
        },
        body: options && options.body ? JSON.stringify(options.body) : undefined,
      });

      if (!response.ok) {
        var message = "LMS runtime request failed";
        try {
          var payload = await response.json();
          if (payload && typeof payload.message === "string") {
            message = payload.message;
          }
        } catch {
          // Ignore JSON parse issues and keep default message.
        }
        throw new Error(message);
      }

      if (response.status === 204) {
        return null;
      }

      return response.json();
    }

    return {
      async startSession(courseId) {
        var data = await request("/sessions/start", {
          method: "POST",
          body: { courseId: courseId },
        });

        attemptId = data && data.attempt ? data.attempt.id : null;
        return data;
      },
      async setValue(key, value) {
        if (!attemptId) {
          return;
        }

        await request("/sessions/" + attemptId + "/value", {
          method: "POST",
          keepalive: true,
          body: { key: key, value: value },
        });
      },
      async commit() {
        if (!attemptId) {
          return;
        }

        await request("/sessions/" + attemptId + "/commit", {
          method: "POST",
          keepalive: true,
        });
      },
      async terminate() {
        if (!attemptId) {
          return;
        }

        await request("/sessions/" + attemptId + "/terminate", {
          method: "POST",
          keepalive: true,
        });
      },
      getAttemptId() {
        return attemptId;
      },
    };
  }

  window.createLmsRuntimeApi = createLmsRuntimeApi;
})();
