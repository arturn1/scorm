import { useEffect, useMemo } from "react";

export type ScormRuntimeEvent = {
  type: "scorm-runtime-updated";
  eventType: string;
  courseId: string;
  launchUrl: string;
  attemptId: string | null;
  payload: Record<string, unknown> | null;
};

export function buildScormPlayerUrl(params: {
  launchUrl: string;
  courseId: string;
  token: string;
}): string {
  const wrapperUrl = new URL("/scorm-wrapper.html", window.location.origin);
  wrapperUrl.searchParams.set("launch", params.launchUrl);
  wrapperUrl.searchParams.set("courseId", params.courseId);
  wrapperUrl.searchParams.set("token", params.token);
  return wrapperUrl.toString();
}

type ScormPlayerProps = {
  launchUrl: string;
  courseId: string;
  token: string;
  title: string;
  className?: string;
  onRuntimeEvent?: (event: ScormRuntimeEvent) => void;
};

export function ScormPlayer(props: ScormPlayerProps) {
  const playerUrl = useMemo(
    () =>
      buildScormPlayerUrl({
        launchUrl: props.launchUrl,
        courseId: props.courseId,
        token: props.token,
      }),
    [props.launchUrl, props.courseId, props.token],
  );

  const expectedOrigin = window.location.origin;

  useEffect(() => {
    const onRuntimeEvent = props.onRuntimeEvent;
    if (!onRuntimeEvent) {
      return;
    }

    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== expectedOrigin) {
        return;
      }

      const data = event.data as Partial<ScormRuntimeEvent> | undefined;
      if (!data || data.type !== "scorm-runtime-updated") {
        return;
      }

      if (data.courseId !== props.courseId || data.launchUrl !== props.launchUrl) {
        return;
      }

      onRuntimeEvent({
        type: "scorm-runtime-updated",
        eventType: String(data.eventType ?? ""),
        courseId: String(data.courseId ?? ""),
        launchUrl: String(data.launchUrl ?? ""),
        attemptId: typeof data.attemptId === "string" ? data.attemptId : null,
        payload: (data.payload ?? null) as Record<string, unknown> | null,
      });
    };

    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, [
    expectedOrigin,
    props.onRuntimeEvent,
    props.courseId,
    props.launchUrl,
  ]);

  return (
    <iframe
      key={props.launchUrl}
      className={props.className}
      src={playerUrl}
      title={props.title}
      allow="fullscreen"
    />
  );
}
