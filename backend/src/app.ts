import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { env } from "./lib/env";
import { errorHandler } from "./middleware/error-handler";
import { getScormAssetObject } from "./lib/scorm-asset-storage";
import { apiRouter } from "./routes";

export const app = express();

app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

app.use(
	"/scorm-content",
	helmet({
		contentSecurityPolicy: {
			directives: {
				defaultSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "data:", "blob:"],
				scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "data:", "blob:"],
				scriptSrcAttr: ["'unsafe-inline'"],
				styleSrc: ["'self'", "'unsafe-inline'"],
				imgSrc: ["'self'", "data:", "blob:"],
				fontSrc: ["'self'", "data:"],
				connectSrc: ["'self'", "data:", "blob:"],
				objectSrc: ["'self'", "data:", "blob:"],
				frameSrc: ["'self'", "data:", "blob:"],
				frameAncestors: ["'self'", env.frontendOrigin],
			},
		},
		xFrameOptions: false,
		crossOriginResourcePolicy: false,
		crossOriginEmbedderPolicy: false,
	}),
	async (req, res, next) => {
		try {
			const key = decodeURIComponent(req.path.replace(/^\/+/, ""));
			if (!key) {
				res.status(404).end();
				return;
			}

			const asset = await getScormAssetObject(key);
			res.setHeader("Content-Type", asset.contentType);
			asset.stream.on("error", (error) => next(error));
			asset.stream.pipe(res);
		} catch (error) {
			res.status(404).end();
		}
	},
);

app.use(helmet());

app.use("/api", apiRouter);

app.use(errorHandler);
