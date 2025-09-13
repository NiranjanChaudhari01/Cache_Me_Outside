import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { taskApi, projectApi, feedbackApi, WebSocketService } from '../services/api';
import { Task, Project, ProjectStats, FeedbackAction, ClientFeedback } from '../types';

export const ClientPortal: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [sampleTasks, setSampleTasks] = useState<Task[]>([]);
  const [stats, setStats] = useState<ProjectStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [feedbackComment, setFeedbackComment] = useState('');
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const [wsService] = useState(() => new WebSocketService('client-' + Date.now()));

  useEffect(() => {
    if (projectId) {
      loadData();
      setupWebSocket();
    }

    return () => {
      wsService.disconnect();
    };
  }, [projectId]);

  const loadData = async () => {
    try {
      const [projectData, tasksData, statsData] = await Promise.all([
        projectApi.getById(Number(projectId)),
        taskApi.getSampleTasks(Number(projectId), 20),
        projectApi.getStats(Number(projectId))
      ]);
      
      setProject(projectData);
      setSampleTasks(tasksData);
      setStats(statsData);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const setupWebSocket = () => {
    wsService.connect(
      (message) => {
        console.log('WebSocket message:', message);
        if (message.type === 'task_reviewed' || message.type === 'client_feedback_received') {
          loadData(); // Refresh data on updates
        }
      },
      (error) => {
        console.error('WebSocket error:', error);
      }
    );
  };

  const handleFeedback = async (action: FeedbackAction, correctedLabels?: any) => {
    if (!selectedTask || !project) return;

    setSubmittingFeedback(true);
    try {
      const feedback: ClientFeedback = {
        project_id: project.id,
        task_id: selectedTask.id,
        action,
        comment: feedbackComment || undefined,
        corrected_labels: correctedLabels,
        client_name: 'Demo Client',
        client_email: 'client@demo.com'
      };

      await feedbackApi.submit(feedback);
      
      // Update local state
      setSampleTasks(prev => 
        prev.map(task => 
          task.id === selectedTask.id 
            ? { ...task, status: action === FeedbackAction.APPROVE ? 'client_approved' : 'client_rejected' } as any
            : task
        )
      );
      
      setSelectedTask(null);
      setFeedbackComment('');
      
    } catch (error) {
      console.error('Error submitting feedback:', error);
    } finally {
      setSubmittingFeedback(false);
    }
  };

  const renderTaskComparison = (task: Task) => {
    const autoLabels = task.auto_labels;
    const finalLabels = task.final_labels;

    return (
      <div className="space-y-4">
        <div className="bg-gray-50 rounded-lg p-4">
          <h4 className="font-medium text-gray-900 mb-2">Original Text</h4>
          <p className="text-gray-800">{task.text}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Auto Labels */}
          <div className="bg-blue-50 rounded-lg p-4">
            <h4 className="font-medium text-blue-900 mb-2">
              Auto-Generated Labels
              <span className="ml-2 text-sm text-blue-600">
                ({((task.confidence_score || 0) * 100).toFixed(0)}% confidence)
              </span>
            </h4>
            {renderLabels(autoLabels, project?.task_type || '')}
          </div>

          {/* Final Labels */}
          <div className="bg-green-50 rounded-lg p-4">
            <h4 className="font-medium text-green-900 mb-2">Human-Reviewed Labels</h4>
            {finalLabels ? renderLabels(finalLabels, project?.task_type || '') : (
              <p className="text-gray-600 italic">Not yet reviewed</p>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderLabels = (labels: any, taskType: string) => {
    if (!labels) return <p className="text-gray-600 italic">No labels</p>;

    if (taskType === 'ner' && labels.entities) {
      return (
        <div className="space-y-2">
          {labels.entities.map((entity: any, index: number) => (
            <div key={index} className="flex items-center space-x-2">
              <span className={`entity-highlight entity-${entity.label} text-xs`}>
                {entity.text}
              </span>
              <span className="text-sm text-gray-600">({entity.label})</span>
            </div>
          ))}
        </div>
      );
    }

    if (taskType === 'sentiment') {
      return (
        <div>
          <div className="font-medium">{labels.sentiment || labels.polarity}</div>
          {labels.scores && (
            <div className="mt-2 space-y-1">
              {Object.entries(labels.scores).map(([label, score]) => (
                <div key={label} className="flex justify-between text-sm">
                  <span>{label}:</span>
                  <span>{((score as number) * 100).toFixed(0)}%</span>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }

    if (taskType === 'classification') {
      return (
        <div>
          <div className="font-medium">{labels.category}</div>
          {labels.scores && (
            <div className="mt-2 space-y-1">
              {Object.entries(labels.scores).map(([category, score]) => (
                <div key={category} className="flex justify-between text-sm">
                  <span>{category}:</span>
                  <span>{((score as number) * 100).toFixed(0)}%</span>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }

    return <pre className="text-xs text-gray-600">{JSON.stringify(labels, null, 2)}</pre>;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{project?.name}</h1>
            <p className="text-gray-600">Client Feedback Portal</p>
          </div>
          <div className="text-right">
            <div className="text-sm text-gray-600">Real-time Updates</div>
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              <span className="text-sm text-green-600">Connected</span>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Dashboard */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="text-2xl font-bold text-primary-600">{stats.total_tasks}</div>
            <div className="text-sm text-gray-600">Total Tasks</div>
          </div>
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="text-2xl font-bold text-green-600">{stats.reviewed}</div>
            <div className="text-sm text-gray-600">Reviewed</div>
          </div>
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="text-2xl font-bold text-blue-600">{stats.approved}</div>
            <div className="text-sm text-gray-600">Approved</div>
          </div>
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="text-2xl font-bold text-purple-600">{stats.completion_rate.toFixed(0)}%</div>
            <div className="text-sm text-gray-600">Complete</div>
          </div>
        </div>
      )}

      {/* Sample Tasks */}
      <div className="bg-white rounded-lg shadow-md">
        <div className="p-6 border-b">
          <h2 className="text-lg font-semibold text-gray-900">Sample Labeled Data</h2>
          <p className="text-gray-600">Review and provide feedback on the annotation quality</p>
        </div>

        <div className="divide-y">
          {sampleTasks.map((task) => (
            <div key={task.id} className="p-6">
              <div className="flex justify-between items-start mb-4">
                <div className="flex-1">
                  <p className="text-gray-900 mb-2">{task.text.substring(0, 150)}...</p>
                  <div className="flex items-center space-x-4 text-sm text-gray-600">
                    <span>Confidence: {((task.confidence_score || 0) * 100).toFixed(0)}%</span>
                    <span>Status: {task.status}</span>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedTask(task)}
                  className="bg-primary-500 hover:bg-primary-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  Review
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Feedback Modal */}
      {selectedTask && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold text-gray-900">Review Task</h3>
                <button
                  onClick={() => setSelectedTask(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="p-6">
              {renderTaskComparison(selectedTask)}

              {/* Feedback Form */}
              <div className="mt-6 pt-6 border-t">
                <h4 className="font-medium text-gray-900 mb-4">Provide Feedback</h4>
                
                <textarea
                  value={feedbackComment}
                  onChange={(e) => setFeedbackComment(e.target.value)}
                  placeholder="Add comments or suggestions..."
                  className="w-full p-3 border border-gray-300 rounded-lg resize-none h-24 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />

                <div className="flex space-x-3 mt-4">
                  <button
                    onClick={() => handleFeedback(FeedbackAction.APPROVE)}
                    disabled={submittingFeedback}
                    className="bg-green-500 hover:bg-green-600 disabled:bg-gray-400 text-white px-6 py-2 rounded-lg font-medium transition-colors"
                  >
                    ✅ Approve
                  </button>
                  
                  <button
                    onClick={() => handleFeedback(FeedbackAction.REJECT)}
                    disabled={submittingFeedback}
                    className="bg-red-500 hover:bg-red-600 disabled:bg-gray-400 text-white px-6 py-2 rounded-lg font-medium transition-colors"
                  >
                    ❌ Reject
                  </button>
                  
                  <button
                    onClick={() => handleFeedback(FeedbackAction.REQUEST_CLARIFICATION)}
                    disabled={submittingFeedback}
                    className="bg-yellow-500 hover:bg-yellow-600 disabled:bg-gray-400 text-white px-6 py-2 rounded-lg font-medium transition-colors"
                  >
                    ❓ Need Clarification
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
