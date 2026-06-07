import { Router } from "express";
import { authRouter } from "./auth.routes";
import { courseRouter } from "./course.routes";
import { healthRouter } from "./health.routes";
import { scormRuntimeRouter } from "./scorm-runtime.routes";
import { userRouter } from "./user.routes";

export const apiRouter = Router();

apiRouter.use(healthRouter);
apiRouter.use(authRouter);
apiRouter.use(courseRouter);
apiRouter.use(scormRuntimeRouter);
apiRouter.use(userRouter);
