import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { taskApi, projectApi } from '../services/api';
import { Task, Project, Entity } from '../types';

export const AnnotatorWorkspace: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [currentTaskIndex, setCurrentTaskIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editedLabels, setEditedLabels] = useState<any>(null);

  const currentTask = tasks[currentTaskIndex];
  const annotatorId = 1; // Demo annotator ID

  useEffect(() => {
    if (projectId) {
      loadProjectAndTasks();
    }
  }, [projectId]);

  const loadProjectAndTasks = async () => {
    try {
      const [projectData, tasksData] = await Promise.all([
        projectApi.getById(Number(projectId)),
        taskApi.getPending(Number(projectId), annotatorId)
      ]);
      
      setProject(projectData);
      setTasks(tasksData);
      setEditedLabels(tasksData[0]?.auto_labels || null);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptLabels = async () => {
    if (!currentTask) return;
    
    setSaving(true);
    try {
      await taskApi.review(currentTask.id, currentTask.auto_labels, annotatorId);
      moveToNextTask();
    } catch (error) {
      console.error('Error accepting labels:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveEdited = async () => {
    if (!currentTask || !editedLabels) return;
    
    setSaving(true);
    try {
      await taskApi.review(currentTask.id, editedLabels, annotatorId);
      moveToNextTask();
    } catch (error) {
      console.error('Error saving edited labels:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleReject = async () => {
    if (!currentTask) return;
    
    setSaving(true);
    try {
      // For demo, we'll just move to next task
      // In real app, you'd mark as rejected and require manual labeling
      moveToNextTask();
    } catch (error) {
      console.error('Error rejecting task:', error);
    } finally {
      setSaving(false);
    }
  };

  const moveToNextTask = () => {
    if (currentTaskIndex < tasks.length - 1) {
      const nextIndex = currentTaskIndex + 1;
      setCurrentTaskIndex(nextIndex);
      setEditedLabels(tasks[nextIndex]?.auto_labels || null);
    } else {
      // Load more tasks or show completion message
      loadProjectAndTasks();
    }
  };

  const renderEntityHighlights = (text: string, entities: Entity[]) => {
    if (!entities || entities.length === 0) {
      return <span>{text}</span>;
    }

    const sortedEntities = [...entities].sort((a, b) => a.start - b.start);
    const parts = [];
    let lastEnd = 0;

    sortedEntities.forEach((entity, index) => {
      // Add text before entity
      if (entity.start > lastEnd) {
        parts.push(
          <span key={`text-${index}`}>
            {text.substring(lastEnd, entity.start)}
          </span>
        );
      }

      // Add highlighted entity
      parts.push(
        <span
          key={`entity-${index}`}
          className={`entity-highlight entity-${entity.label} cursor-pointer`}
          title={`${entity.label}: ${entity.description || ''}`}
        >
          {entity.text}
        </span>
      );

      lastEnd = entity.end;
    });

    // Add remaining text
    if (lastEnd < text.length) {
      parts.push(
        <span key="text-end">
          {text.substring(lastEnd)}
        </span>
      );
    }

    return <>{parts}</>;
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'confidence-high';
    if (confidence >= 0.6) return 'confidence-medium';
    return 'confidence-low';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  if (!project || tasks.length === 0) {
    return (
      <div className="text-center py-12">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">No Tasks Available</h2>
        <p className="text-gray-600">All tasks have been completed or there are no tasks to review.</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{project.name}</h1>
            <p className="text-gray-600">Annotator Workspace - {project.task_type.toUpperCase()}</p>
          </div>
          <div className="text-right">
            <div className="text-sm text-gray-600">Progress</div>
            <div className="text-lg font-semibold text-primary-600">
              {currentTaskIndex + 1} / {tasks.length}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Text Content */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Text to Annotate</h2>
          <div className="bg-gray-50 rounded-lg p-4 mb-4">
            <div className="text-gray-900 leading-relaxed">
              {project.task_type === 'ner' && currentTask.auto_labels?.entities ? 
                renderEntityHighlights(currentTask.text, currentTask.auto_labels.entities) :
                currentTask.text
              }
            </div>
          </div>

          {/* Confidence Score */}
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-600">Confidence:</span>
            <span className={`px-2 py-1 rounded text-sm font-medium ${getConfidenceColor(currentTask.confidence_score || 0)}`}>
              {((currentTask.confidence_score || 0) * 100).toFixed(0)}%
            </span>
          </div>
        </div>

        {/* Labels Panel */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Auto-Generated Labels</h2>
          
          {/* Labels Display */}
          <div className="space-y-4 mb-6">
            {project.task_type === 'ner' && currentTask.auto_labels?.entities && (
              <div>
                <h3 className="font-medium text-gray-900 mb-2">Named Entities</h3>
                <div className="space-y-2">
                  {currentTask.auto_labels.entities.map((entity: Entity, index: number) => (
                    <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                      <div>
                        <span className={`entity-highlight entity-${entity.label}`}>
                          {entity.text}
                        </span>
                        <span className="ml-2 text-sm text-gray-600">({entity.label})</span>
                      </div>
                      <button className="text-red-500 hover:text-red-700 text-sm">Remove</button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {project.task_type === 'sentiment' && currentTask.auto_labels?.sentiment && (
              <div>
                <h3 className="font-medium text-gray-900 mb-2">Sentiment Analysis</h3>
                <div className="p-3 bg-gray-50 rounded">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{currentTask.auto_labels.sentiment}</span>
                    <span className="text-sm text-gray-600">
                      {currentTask.auto_labels.polarity}
                    </span>
                  </div>
                  {currentTask.auto_labels.scores && (
                    <div className="mt-2 space-y-1">
                      {Object.entries(currentTask.auto_labels.scores).map(([label, score]) => (
                        <div key={label} className="flex justify-between text-sm">
                          <span>{label}:</span>
                          <span>{((score as number) * 100).toFixed(0)}%</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {project.task_type === 'classification' && currentTask.auto_labels?.category && (
              <div>
                <h3 className="font-medium text-gray-900 mb-2">Classification</h3>
                <div className="p-3 bg-gray-50 rounded">
                  <div className="font-medium mb-2">{currentTask.auto_labels.category}</div>
                  {currentTask.auto_labels.scores && (
                    <div className="space-y-1">
                      {Object.entries(currentTask.auto_labels.scores).map(([category, score]) => (
                        <div key={category} className="flex justify-between text-sm">
                          <span>{category}:</span>
                          <span>{((score as number) * 100).toFixed(0)}%</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="space-y-3">
            <button
              onClick={handleAcceptLabels}
              disabled={saving}
              className="w-full bg-green-500 hover:bg-green-600 disabled:bg-gray-400 text-white py-2 px-4 rounded-lg font-medium transition-colors"
            >
              {saving ? 'Saving...' : '✅ Accept Labels'}
            </button>
            
            <button
              onClick={handleSaveEdited}
              disabled={saving}
              className="w-full bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white py-2 px-4 rounded-lg font-medium transition-colors"
            >
              {saving ? 'Saving...' : '📝 Save Edited'}
            </button>
            
            <button
              onClick={handleReject}
              disabled={saving}
              className="w-full bg-red-500 hover:bg-red-600 disabled:bg-gray-400 text-white py-2 px-4 rounded-lg font-medium transition-colors"
            >
              {saving ? 'Processing...' : '❌ Reject & Skip'}
            </button>
          </div>

          {/* Model Info */}
          <div className="mt-6 pt-4 border-t text-xs text-gray-500">
            <div>Model: {currentTask.auto_labels?.model_used || 'Unknown'}</div>
            <div>Generated: {currentTask.auto_labels?.timestamp ? 
              new Date(currentTask.auto_labels.timestamp).toLocaleString() : 'Unknown'}</div>
          </div>
        </div>
      </div>
    </div>
  );
};
