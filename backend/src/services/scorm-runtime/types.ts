export type TrailProgressItem = {
  progress: number;
  quizScore: number | null;
  successStatus: string | null;
  isQuiz: boolean;
  updatedAt: string | null;
};

export type OutlineNode = {
  launchPath: string | null;
  children: OutlineNode[];
};
