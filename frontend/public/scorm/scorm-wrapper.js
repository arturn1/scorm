(function () {
  function parseQuery() {
    var params = new URLSearchParams(window.location.search);
    return {
      rawLaunch: params.get("launch") || "",
      courseId: params.get("courseId") || "",
      token: params.get("token") || "",
    };
  }

  function toSameOriginLaunchUrl(rawLaunch) {
    if (!rawLaunch) {
      return "";
    }

    try {
      var parsed = new URL(rawLaunch);
      if (!parsed.pathname.startsWith("/scorm-content/")) {
        return "";
      }
      return parsed.pathname + parsed.search;
    } catch {
      if (rawLaunch.startsWith("/scorm-content/")) {
        return rawLaunch;
      }
      return "";
    }
  }

  var query = parseQuery();
  var launchUrl = toSameOriginLaunchUrl(query.rawLaunch);
  var launchKey = encodeURIComponent(query.rawLaunch);
  var itemLocationKey = "__item.location::" + launchKey;
  var frame = document.getElementById("scormFrame");
  var statusNode = document.getElementById("status");

  if (!query.courseId || !query.token || !launchUrl) {
    if (statusNode) {
      statusNode.textContent = "Invalid SCORM wrapper parameters.";
    }
    return;
  }

  var api = window.createLmsRuntimeApi({
    token: query.token,
    apiBase: "/api/scorm-runtime",
  });

  var store = {
    "cmi.location": "",
    "cmi.completion_status": "unknown",
    "cmi.success_status": "unknown",
    "cmi.exit": "",
    "cmi.session_time": "",
    "adl.nav.request": "",
    "cmi.score.raw": "",
    "cmi.score.min": "",
    "cmi.score.max": "",
    "cmi.score.scaled": "",
  };

  var initialized = false;
  var terminated = false;
  var runtimeReadOnly = false;
  var lastError = "0";

  function setStatus(text) {
    if (statusNode) {
      statusNode.textContent = text;
    }
  }

  function setError(code) {
    lastError = code;
  }

  function ok() {
    setError("0");
    return "true";
  }

  function notifyParent(eventType, payload) {
    try {
      if (!window.parent || window.parent === window) {
        return;
      }

      window.parent.postMessage(
        {
          type: "scorm-runtime-updated",
          eventType: eventType,
          courseId: query.courseId,
          launchUrl: query.rawLaunch,
          attemptId: api.getAttemptId(),
          payload: payload || null,
        },
        window.location.origin,
      );
    } catch (error) {
      console.error("Failed posting message to parent", error);
    }
  }

  function toNumber(value) {
    var parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function normalizeScorePercent() {
    var scaled = toNumber(store["cmi.score.scaled"]);
    if (scaled !== null) {
      return scaled >= 0 && scaled <= 1 ? Math.round(scaled * 100) : Math.round(scaled);
    }

    var raw = toNumber(store["cmi.score.raw"]);
    if (raw !== null) {
      return Math.round(raw);
    }

    return null;
  }

  function inferItemProgress() {
    var completion = String(store["cmi.completion_status"] || "").toLowerCase();
    var success = String(store["cmi.success_status"] || "").toLowerCase();
    var location = String(store["cmi.location"] || "");

    if (completion === "completed" || success === "passed" || success === "failed") {
      return 100;
    }

    if (completion === "incomplete" || location.length > 0) {
      return 60;
    }

    return 10;
  }

  function persistCurrentItemSnapshot() {
    var progress = inferItemProgress();
    var score = normalizeScorePercent();
    var success = String(store["cmi.success_status"] || "");
    var completion = String(store["cmi.completion_status"] || "");
    var isQuiz = /assessment|quiz|exam|test/i.test(query.rawLaunch);

    void api.setValue("__item.progress::" + launchKey, String(progress));
    void api.setValue("__item.isQuiz::" + launchKey, isQuiz ? "1" : "0");

    if (score !== null) {
      void api.setValue("__item.score::" + launchKey, String(score));
    }

    void api.setValue(itemLocationKey, String(store["cmi.location"] || ""));

    if (success) {
      void api.setValue("__item.success::" + launchKey, success);
    }

    if (completion) {
      void api.setValue("__item.completion::" + launchKey, completion);
    }

    notifyParent("item_snapshot", {
      progress: progress,
      score: score,
      success: success || null,
      completion: completion || null,
    });
  }

  window.API_1484_11 = {
    Initialize: function () {
      if (initialized) {
        setError("103");
        return "false";
      }
      initialized = true;
      terminated = false;
      return ok();
    },
    Terminate: function () {
      if (!initialized || terminated) {
        setError("112");
        return "false";
      }
      terminated = true;
      return ok();
    },
    GetValue: function (element) {
      if (!initialized || terminated) {
        setError("122");
        return "";
      }
      if (Object.prototype.hasOwnProperty.call(store, element)) {
        return String(store[element]);
      }
      return "";
    },
    SetValue: function (element, value) {
      if (!initialized || terminated) {
        setError("132");
        return "false";
      }
      store[element] = String(value || "");
      if (runtimeReadOnly) {
        notifyParent("readonly_set_ignored", { key: element });
        return ok();
      }
      void api.setValue(element, store[element]);
      if (element === "cmi.location") {
        void api.setValue(itemLocationKey, store[element]);
      }
      notifyParent("set_value", { key: element, value: store[element] });
      return ok();
    },
    Commit: function () {
      if (!initialized || terminated) {
        setError("142");
        return "false";
      }
      if (runtimeReadOnly) {
        notifyParent("readonly_commit_ignored", null);
        return ok();
      }
      persistCurrentItemSnapshot();
      void api.commit();
      notifyParent("commit", null);
      return ok();
    },
    GetLastError: function () {
      return lastError;
    },
    GetErrorString: function (errorCode) {
      var map = {
        "0": "No error",
        "103": "Already initialized",
        "112": "Terminate before Initialize or after Terminate",
        "122": "GetValue before Initialize or after Terminate",
        "132": "SetValue before Initialize or after Terminate",
        "142": "Commit before Initialize or after Terminate",
      };
      return map[String(errorCode)] || "General error";
    },
    GetDiagnostic: function () {
      return "SCORM runtime shim";
    },
  };

  window.addEventListener("beforeunload", function () {
    if (runtimeReadOnly) {
      return;
    }
    persistCurrentItemSnapshot();
    void api.terminate();
    notifyParent("terminate", null);
  });

  async function bootstrapAttempt() {
    try {
      setStatus("Loading runtime session...");
      var data = await api.startSession(query.courseId);
      runtimeReadOnly = Boolean(data.readOnly);
      store = Object.assign({}, store, data.runtimeValues || {});

      if (data.runtimeValues && Object.prototype.hasOwnProperty.call(data.runtimeValues, itemLocationKey)) {
        store["cmi.location"] = String(data.runtimeValues[itemLocationKey] || "");
      } else {
        store["cmi.location"] = "";
      }

      if (runtimeReadOnly) {
        notifyParent("readonly", { enabled: true });
      }

      frame.src = launchUrl;
      setStatus("Runtime ready.");
    } catch (error) {
      console.error("SCORM attempt bootstrap failed", error);
      setStatus("Failed to start runtime session.");
    }
  }

  void bootstrapAttempt();
})();
