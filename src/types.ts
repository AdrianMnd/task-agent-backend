export interface Task {
  id: number;
  title: string;
  description: string | null;
  due_date: string | null;
  completed: boolean;
  source: 'manual' | 'github';
  external_ref: string | null;
  created_at: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}
