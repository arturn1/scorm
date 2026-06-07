import multer from "multer";

export const upload = multer({
  dest: "/tmp/scorm-upload",
  limits: {
    fileSize: 1024 * 1024 * 200,
  },
});
