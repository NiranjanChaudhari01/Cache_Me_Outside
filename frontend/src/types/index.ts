export interface Project {
  id: number;
  name: string;
  description?: string;
  task_type: string;
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: number;
  project_id: number;
  text: string;
  auto_labels?: any;
  confidence_score?: number;
  final_labels?: any;
  status: TaskStatus;
  created_at: string;
  updated_at: string;
}

export enum TaskStatus {
  UPLOADED = "uploaded",
  AUTO_LABELED = "auto_labeled",
  IN_REVIEW = "in_review",
  REVIEWED = "reviewed",
  CLIENT_APPROVED = "client_approved",
  CLIENT_REJECTED = "client_rejected",
  COMPLETED = "completed"
}

export enum FeedbackAction {
  APPROVE = "approve",
  REJECT = "reject",
  CORRECT = "correct",
  REQUEST_CLARIFICATION = "request_clarification"
}

export interface ClientFeedback {
  id?: number;
  project_id: number;
  task_id: number;
  action: FeedbackAction;
  comment?: string;
  corrected_labels?: any;
  client_name?: string;
  client_email?: string;
  created_at?: string;
}

export interface Annotator {
  id: number;
  name: string;
  email: string;
  tasks_completed: number;
  accuracy_score: number;
  avg_time_per_task: number;
}

export interface ProjectStats {
  total_tasks: number;
  in_review: number;
  reviewed: number;
  approved: number;
  completion_rate: number;
  average_confidence: number;
}

export interface Entity {
  text: string;
  label: string;
  start: number;
  end: number;
  description?: string;
}

export interface AutoLabelResult {
  labels: any;
  confidence: number;
  model_used: string;
  timestamp: string;
}

export interface WebSocketMessage {
  type: string;
  data: any;
  timestamp?: string;
}
