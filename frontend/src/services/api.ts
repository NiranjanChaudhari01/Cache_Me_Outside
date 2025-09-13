import axios from 'axios';
import { Project, Task, ClientFeedback, ProjectStats } from '../types';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Project API
export const projectApi = {
  getAll: (): Promise<Project[]> => 
    api.get('/projects/').then(res => res.data),
  
  getById: (id: number): Promise<Project> => 
    api.get(`/projects/${id}`).then(res => res.data),
  
  create: (project: Omit<Project, 'id' | 'created_at' | 'updated_at'>): Promise<Project> => 
    api.post('/projects/', project).then(res => res.data),
  
  uploadDataset: async (projectId: number, file: File): Promise<{ message: string }> => {
    console.log('=== FRONTEND UPLOAD DEBUG ===');
    console.log('Project ID:', projectId);
    console.log('File:', file);
    console.log('File name:', file.name);
    console.log('File size:', file.size);
    console.log('File type:', file.type);
    console.log('File lastModified:', file.lastModified);
    console.log('File instanceof File:', file instanceof File);
    
    // Validate file
    if (!file || file.size === 0) {
      throw new Error('Invalid file: file is empty or null');
    }
    
    const formData = new FormData();
    formData.append('file', file);
    
    // Debug FormData contents
    console.log('FormData has file:', formData.has('file'));
    console.log('FormData file value:', formData.get('file'));
    
    console.log('FormData created, sending request...');
    
    // Use axios but remove the default Content-Type header for FormData
    return api.post(`/projects/${projectId}/upload`, formData, {
      headers: {
        'Content-Type': undefined  // Let browser set the boundary
      }
    }).then(res => {
      console.log('Upload successful with axios:', res.data);
      return res.data;
    });
  },
  
  autoLabel: (projectId: number, taskType: string, batchSize?: number): Promise<{ message: string }> => 
    api.post(`/projects/${projectId}/auto-label`, { 
      task_type: taskType, 
      batch_size: batchSize 
    }).then(res => res.data),
  
  getStats: (projectId: number): Promise<ProjectStats> => 
    api.get(`/projects/${projectId}/stats`).then(res => res.data),
  
  exportData: (projectId: number): Promise<{ data: any[], count: number }> => 
    api.get(`/projects/${projectId}/export`).then(res => res.data),
};

// Task API
export const taskApi = {
  getPending: (projectId: number, annotatorId?: number): Promise<Task[]> => {
    const params = annotatorId ? { annotator_id: annotatorId } : {};
    return api.get(`/projects/${projectId}/tasks/pending`, { params }).then(res => res.data);
  },
  
  review: (taskId: number, finalLabels: any, annotatorId: number): Promise<{ message: string }> => 
    api.put(`/tasks/${taskId}/review`, { 
      final_labels: finalLabels, 
      annotator_id: annotatorId 
    }).then(res => res.data),
  
  getSampleTasks: (projectId: number, limit?: number): Promise<Task[]> => {
    const params = limit ? { limit } : {};
    return api.get(`/projects/${projectId}/sample-tasks`, { params }).then(res => res.data);
  },
};

// Feedback API
export const feedbackApi = {
  submit: (feedback: ClientFeedback): Promise<{ message: string }> => 
    api.post('/feedback/', feedback).then(res => res.data),
};

// WebSocket connection
export class WebSocketService {
  private ws: WebSocket | null = null;
  private clientId: string;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  
  constructor(clientId: string) {
    this.clientId = clientId;
  }
  
  connect(onMessage: (data: any) => void, onError?: (error: Event) => void) {
    const wsUrl = `ws://localhost:8000/ws/${this.clientId}`;
    
    try {
      this.ws = new WebSocket(wsUrl);
      
      this.ws.onopen = () => {
        console.log('WebSocket connected');
        this.reconnectAttempts = 0;
      };
      
      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          onMessage(data);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };
      
      this.ws.onclose = () => {
        console.log('WebSocket disconnected');
        this.attemptReconnect(onMessage, onError);
      };
      
      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        if (onError) onError(error);
      };
      
    } catch (error) {
      console.error('Error creating WebSocket connection:', error);
      if (onError) onError(error as Event);
    }
  }
  
  private attemptReconnect(onMessage: (data: any) => void, onError?: (error: Event) => void) {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`Attempting to reconnect... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
      
      setTimeout(() => {
        this.connect(onMessage, onError);
      }, 2000 * this.reconnectAttempts); // Exponential backoff
    }
  }
  
  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
  
  send(data: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }
}

export default api;
