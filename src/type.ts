export type ScriptData = {
  speaker: string;
  text: string;
  duration: number; // generated
  filename: string; // generated
  imagePrompt: string; // inserted by LLM
};

export type PodcastScript = {
  title: string;
  padding: number | undefined;
  description: string;
  reference: string;
  tts: string | undefined; // default: openAI
  voices: string[] | undefined;
  speakers: string[] | undefined;
  script: ScriptData[];
  filename: string; // generated
  voicemap: Map<string, string>; // generated
  ttsAgent: string; // generated
  imageInfo: any[]; // generated
  aspectRatio: string | undefined; // "16:9" or "9:16"
};
