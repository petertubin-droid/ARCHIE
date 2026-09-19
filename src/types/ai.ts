// Types for the Smart Color Assistant feature.

export interface AiColor {
  name: string;
  hex: string;
  role: 'main' | 'secondary' | 'accent';
}

export interface AiRecommendation {
  paletteSummary: string;
  colors: AiColor[];
  finishSuggestion: string;
  whyItWorks: string;
  additionalSuggestions: string;
}

export type AiConsultMode = 'text' | 'image';

export type AiRequestStatus =
  | 'idle'
  | 'preparing'
  | 'uploading'
  | 'analyzing'
  | 'generating'
  | 'success'
  | 'error';

export interface AiError {
  code: string;
  message: string;
}
