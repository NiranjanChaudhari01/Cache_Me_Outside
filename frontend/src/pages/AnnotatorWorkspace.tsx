import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { taskApi, projectApi } from '../services/api';
import { Task, Project, Entity, TaskStatus } from '../types';

interface TrainingStats {
  total_corrections: number;
  retrain_threshold: number;
  next_retrain_in: number;
  corrections_by_type: { [key: string]: number };
}

export const AnnotatorWorkspace: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [currentTaskIndex, setCurrentTaskIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editedLabels, setEditedLabels] = useState<any>(null);
  const [trainingStats, setTrainingStats] = useState<TrainingStats | null>(null);
  const [showLearningFeedback, setShowLearningFeedback] = useState(false);
  const [lastCorrection, setLastCorrection] = useState<string | null>(null);
  const [retrainingInProgress, setRetrainingInProgress] = useState(false);
  const [learningInsights, setLearningInsights] = useState<any>(null);

  const currentTask = tasks[currentTaskIndex];
  const annotatorId = 1; // Demo annotator ID

  useEffect(() => {
    if (projectId) {
      loadProjectAndTasks();
    }
  }, [projectId]);

  const loadProjectAndTasks = async () => {
    try {
      console.log('🔍 Loading project and tasks for projectId:', projectId);
      const [projectData, tasksData] = await Promise.all([
        projectApi.getById(Number(projectId)),
        taskApi.getPending(Number(projectId), annotatorId)
      ]);
      
      console.log('📊 Project data:', projectData);
      console.log('📋 Tasks data:', tasksData);
      console.log('📊 Number of tasks:', tasksData.length);
      
      setProject(projectData);
      setTasks(tasksData);
      setEditedLabels(tasksData[0]?.auto_labels ? { ...tasksData[0].auto_labels } : null);
      
      // Load training stats
      loadTrainingStats();
    } catch (error) {
      console.error('❌ Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadTrainingStats = async () => {
    try {
      const response = await fetch(`http://localhost:8000/projects/${projectId}/training-stats`);
      const data = await response.json();
      setTrainingStats(data.active_learning);
      
      // Load learning insights
      const insightsResponse = await fetch(`http://localhost:8000/projects/${projectId}/learning-insights?task_type=${project?.task_type}`);
      const insightsData = await insightsResponse.json();
      setLearningInsights(insightsData.insights);
    } catch (error) {
      console.error('Error loading training stats:', error);
    }
  };

  const handleAcceptLabels = async () => {
    if (!currentTask) return;
    
    setSaving(true);
    try {
      await taskApi.review(currentTask.id, currentTask.auto_labels, annotatorId);
      
      // Update the current task in local state with the accepted auto_labels as final_labels
      const updatedTasks = tasks.map(task => 
        task.id === currentTask.id 
          ? { ...task, final_labels: currentTask.auto_labels, status: TaskStatus.REVIEWED }
          : task
      );
      setTasks(updatedTasks);
      
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
      const response = await taskApi.review(currentTask.id, editedLabels, annotatorId);
      
      // Update the current task in local state with the saved final_labels
      const updatedTasks = tasks.map(task => 
        task.id === currentTask.id 
          ? { ...task, final_labels: editedLabels, status: TaskStatus.REVIEWED }
          : task
      );
      setTasks(updatedTasks);
      
      console.log('✅ Task updated in local state:', {
        taskId: currentTask.id,
        final_labels: editedLabels,
        status: TaskStatus.REVIEWED
      });
      
      // Additional debugging for export verification
      console.log('🔍 Export verification - Current task state:', {
        taskId: currentTask.id,
        auto_labels: currentTask.auto_labels,
        edited_labels: editedLabels,
        will_be_exported: 'YES - Status will be REVIEWED'
      });
      
      // Check if labels were changed (for learning feedback)
      const labelsChanged = JSON.stringify(currentTask.auto_labels) !== JSON.stringify(editedLabels);
      
      if (labelsChanged) {
        setLastCorrection(`Labels corrected for task ${currentTask.id}`);
        setShowLearningFeedback(true);
        
        // Check if this correction triggers retraining
        if (trainingStats && trainingStats.next_retrain_in === 1) {
          setRetrainingInProgress(true);
          setLastCorrection(`Labels corrected for task ${currentTask.id} • Model retraining triggered!`);
        }
        
        // Reload training stats to show updated counts
        setTimeout(() => {
          loadTrainingStats();
          if (retrainingInProgress) {
            setRetrainingInProgress(false);
          }
        }, 1000);
      }
      
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
      setEditedLabels(tasks[nextIndex]?.auto_labels ? { ...tasks[nextIndex].auto_labels } : null);
    } else {
      // Load more tasks or show completion message
      loadProjectAndTasks();
    }
  };

  const handleRemoveEntity = (entityIndex: number) => {
    const currentEntities = editedLabels?.entities || currentTask?.auto_labels?.entities || [];
    if (!currentEntities) return;
    
    const updatedEntities = currentEntities.filter((_: any, index: number) => index !== entityIndex);
    
    const baseLabels = editedLabels || currentTask?.auto_labels || {};
    const updatedLabels = {
      ...baseLabels,
      entities: updatedEntities,
      entity_count: updatedEntities.length,
      entity_types: Array.from(new Set(updatedEntities.map((ent: any) => ent.class_name)))
    };
    
    setEditedLabels(updatedLabels);
  };

  const handleAddEntity = () => {
    const newEntity = {
      class_name: 'PER', // Default to person
      start_index: 0,
      end_index: 0,
      text: 'New Entity',
      original_label: 'PERSON'
    };
    
    const currentEntities = editedLabels?.entities || currentTask?.auto_labels?.entities || [];
    const updatedEntities = [...currentEntities, newEntity];
    
    const baseLabels = editedLabels || currentTask?.auto_labels || {};
    const updatedLabels = {
      ...baseLabels,
      entities: updatedEntities,
      entity_count: updatedEntities.length,
      entity_types: Array.from(new Set(updatedEntities.map((ent: any) => ent.class_name)))
    };
    
    setEditedLabels(updatedLabels);
  };

  const handleExportData = async () => {
    if (!projectId) return;
    
    try {
      const data = await projectApi.exportData(Number(projectId));
      
      // Debug: Log what's being exported
      console.log('📤 Export data received:', {
        count: data.count,
        tasks: data.data.map((task: any) => ({
          id: task.id,
          text: task.text.substring(0, 30) + '...',
          final_labels: task.final_labels,
          status: task.status
        }))
      });
      
      // Create and download JSON file
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `annotated_data_project_${projectId}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      console.log('✅ Data exported successfully!', data);
      alert(`✅ Exported ${data.count} annotated tasks!`);
    } catch (error) {
      console.error('Error exporting data:', error);
      alert('❌ Error exporting data. Please try again.');
    }
  };

  const renderEntityHighlights = (text: string, entities: any[]) => {
    if (!entities || entities.length === 0) {
      return <span>{text}</span>;
    }

    console.log('🎯 renderEntityHighlights called with:', { text: text.substring(0, 50) + '...', entities });

    // Handle different entity formats from auto-labeler
    const sortedEntities = [...entities].sort((a, b) => {
      const startA = a.start_index || a.start || 0;
      const startB = b.start_index || b.start || 0;
      return startA - startB;
    });
    
    const parts = [];
    let lastEnd = 0;

    sortedEntities.forEach((entity, index) => {
      const start = entity.start_index || entity.start || 0;
      const end = entity.end_index || entity.end || start + (entity.text?.length || 0);
      const entityText = entity.text || '';
      const entityLabel = entity.class_name || entity.label || 'ENTITY';

      // Add text before entity
      if (start > lastEnd) {
        parts.push(
          <span key={`text-${index}`}>
            {text.substring(lastEnd, start)}
          </span>
        );
      }

      // Add highlighted entity
      parts.push(
        <span
          key={`entity-${index}`}
          className={`entity-highlight entity-${entityLabel} cursor-pointer bg-yellow-200 px-1 rounded`}
          title={`${entityLabel}: ${entityText}`}
        >
          {entityText}
        </span>
      );

      lastEnd = end;
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

  const renderFullTextWithHighlight = (fullText: string, textToAnnotate: string, entities?: any[]) => {
    console.log('🔍 renderFullTextWithHighlight called:', { fullText, textToAnnotate, entities });
    console.log('📏 Text lengths:', { fullTextLength: fullText?.length, textToAnnotateLength: textToAnnotate?.length });
    
    if (!fullText || !textToAnnotate) {
      return <span>{textToAnnotate || fullText}</span>;
    }

    // If fullText and textToAnnotate are the same, show the full text with entity highlighting
    if (fullText === textToAnnotate) {
      console.log('📝 Full text and annotation target are the same - showing full text with entities');
      return entities ? renderEntityHighlights(fullText, entities) : <span>{fullText}</span>;
    }

    // Find the text to annotate within the full text
    const startIndex = fullText.indexOf(textToAnnotate);
    console.log('🔍 Start index:', startIndex);
    
    if (startIndex === -1) {
      // If not found as exact substring, show the full text and highlight entities within it
      console.log('⚠️ Annotation target not found as exact substring - showing full text with entity highlights');
      return (
        <span>
          {entities ? renderEntityHighlights(fullText, entities) : fullText}
          <div className="mt-2 text-xs text-blue-600 bg-blue-50 p-2 rounded">
            <strong>Note:</strong> Target "{textToAnnotate}" not found as exact substring in full text. Showing full text with detected entities.
          </div>
        </span>
      );
    }

    const endIndex = startIndex + textToAnnotate.length;
    const beforeText = fullText.substring(0, startIndex);
    const afterText = fullText.substring(endIndex);

    console.log('✅ Highlighting text:', { beforeText, textToAnnotate, afterText });

    return (
      <span>
        {beforeText}
        <span className="bg-orange-200 border-2 border-orange-500 px-2 py-1 rounded font-semibold text-orange-900 shadow-md">
          {entities ? renderEntityHighlights(textToAnnotate, entities) : textToAnnotate}
        </span>
        {afterText}
      </span>
    );
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

  if (!project || tasks.length === 0 || !currentTask) {
    return (
      <div className="text-center py-12">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">No Tasks Available</h2>
        <p className="text-gray-600 mb-6">All tasks have been completed or there are no tasks to review.</p>
        
        {project && (
          <div className="space-y-4">
            <button
              onClick={handleExportData}
              className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-lg font-medium"
            >
              📥 Export Annotated Data
            </button>
            <p className="text-sm text-gray-500">
              Download all completed annotations as JSON
            </p>
          </div>
        )}
        
        <div className="mt-8 text-xs text-gray-300">
          Debug: projectId={projectId}, project={project ? 'found' : 'null'}, tasks={tasks.length}, currentTask={currentTask ? 'found' : 'null'}
        </div>
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
          <div className="text-right flex items-center space-x-4">
            <div>
              <div className="text-sm text-gray-600">Progress</div>
              <div className="text-lg font-semibold text-primary-600">
                {currentTaskIndex + 1} / {tasks.length}
              </div>
            </div>
            <button
              onClick={handleExportData}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
            >
              📥 Export Data
            </button>
          </div>
        </div>
        
        {/* Active Learning Feedback */}
        {trainingStats && (
          <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse"></div>
                  <span className="text-sm font-medium text-blue-900">Active Learning</span>
                </div>
                <div className="text-sm text-blue-700">
                  {trainingStats.total_corrections} corrections made • 
                  {trainingStats.next_retrain_in} more until retrain
                </div>
              </div>
              <button
                onClick={() => setShowLearningFeedback(!showLearningFeedback)}
                className="text-blue-600 hover:text-blue-800 text-sm font-medium"
              >
                {showLearningFeedback ? 'Hide Details' : 'Show Details'}
              </button>
            </div>
            
            {showLearningFeedback && (
              <div className="mt-3 space-y-2">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="text-gray-600">Total Corrections:</span>
                    <span className="ml-2 font-medium">{trainingStats.total_corrections}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Retrain Threshold:</span>
                    <span className="ml-2 font-medium">{trainingStats.retrain_threshold}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Next Retrain:</span>
                    <span className="ml-2 font-medium text-orange-600">{trainingStats.next_retrain_in}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Progress:</span>
                    <span className="ml-2 font-medium">
                      {Math.round((trainingStats.total_corrections / trainingStats.retrain_threshold) * 100)}%
                    </span>
                  </div>
                </div>
                
                {/* Progress Bar */}
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                    style={{ 
                      width: `${Math.min((trainingStats.total_corrections / trainingStats.retrain_threshold) * 100, 100)}%` 
                    }}
                  ></div>
                </div>
                
                {/* Corrections by Type */}
                {Object.keys(trainingStats.corrections_by_type).length > 0 && (
                  <div className="text-sm">
                    <span className="text-gray-600">By Type:</span>
                    <div className="flex space-x-4 mt-1">
                      {Object.entries(trainingStats.corrections_by_type).map(([type, count]) => (
                        <span key={type} className="text-blue-700">
                          {type.toUpperCase()}: {count}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Learning Insights */}
                {learningInsights && learningInsights.total_corrections > 0 && (
                  <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                    <div className="text-sm font-medium text-green-800 mb-2">Learning Insights</div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-green-600">Accuracy Boost:</span>
                        <span className="ml-1 font-medium">{learningInsights.accuracy_improvement}</span>
                      </div>
                      <div>
                        <span className="text-green-600">Overconfident:</span>
                        <span className="ml-1 font-medium">{learningInsights.overconfident_cases}</span>
                      </div>
                      <div>
                        <span className="text-green-600">Underconfident:</span>
                        <span className="ml-1 font-medium">{learningInsights.underconfident_cases}</span>
                      </div>
                      <div>
                        <span className="text-green-600">Status:</span>
                        <span className="ml-1 font-medium text-green-700">{learningInsights.learning_status}</span>
                      </div>
                    </div>
                    {learningInsights.most_common_errors && learningInsights.most_common_errors.length > 0 && (
                      <div className="mt-2 text-xs">
                        <span className="text-green-600">Common Errors:</span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {learningInsights.most_common_errors.map(([error, count]: [string, number], index: number) => (
                            <span key={index} className="bg-green-100 text-green-800 px-2 py-1 rounded text-xs">
                              {error} ({count})
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        
        {/* Learning Feedback Notification */}
        {showLearningFeedback && lastCorrection && (
          <div className={`mt-3 p-3 rounded-lg border ${
            retrainingInProgress 
              ? 'bg-purple-50 border-purple-200' 
              : 'bg-green-50 border-green-200'
          }`}>
            <div className="flex items-center space-x-2">
              <div className={`w-2 h-2 rounded-full ${
                retrainingInProgress ? 'bg-purple-500 animate-pulse' : 'bg-green-500'
              }`}></div>
              <span className={`text-sm ${
                retrainingInProgress ? 'text-purple-800' : 'text-green-800'
              }`}>
                {lastCorrection}
              </span>
              <span className={`text-xs ${
                retrainingInProgress ? 'text-purple-600' : 'text-green-600'
              }`}>
                {retrainingInProgress ? '• Model retraining in progress...' : '• Added to learning data'}
              </span>
            </div>
            {retrainingInProgress && (
              <div className="mt-2 text-xs text-purple-700">
                The model is learning from your corrections and will improve future predictions!
              </div>
            )}
          </div>
        )}
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Text Content */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Text to Annotate
            {currentTask && (
              <span className="ml-2 text-sm font-normal text-gray-500 bg-gray-100 px-2 py-1 rounded">
                ID: {currentTask.id}
              </span>
            )}
          </h2>
          <div className="bg-gray-50 rounded-lg p-4 mb-4">
            <div className="text-gray-900 leading-relaxed">
              {currentTask && project.task_type === 'ner' ? (
                <div className="space-y-2">
                  {/* Full text with highlighted portion */}
                  <div className="bg-gray-50 border border-gray-200 p-4 rounded">
                    <div className="text-sm text-gray-600 font-medium mb-2">Full Text with Highlighted Annotation Target:</div>
                    <div className="text-gray-900 leading-relaxed whitespace-pre-wrap break-words">
                      {(() => {
                        console.log('🔍 Current task data:', {
                          taskId: currentTask.id,
                          taskText: currentTask.text,
                          taskMetadata: currentTask.task_metadata,
                          fullTextFromMetadata: currentTask.task_metadata?.full_text,
                          finalFullText: currentTask.task_metadata?.full_text || currentTask.text
                        });
                        const fullText = currentTask.task_metadata?.full_text || currentTask.text;
                        const textToAnnotate = currentTask.text;
                        
                        console.log('🔍 Function parameters:', {
                          fullText,
                          textToAnnotate,
                          areEqual: fullText === textToAnnotate,
                          fullTextLength: fullText?.length,
                          textToAnnotateLength: textToAnnotate?.length
                        });
                        
                        return renderFullTextWithHighlight(
                          fullText,
                          textToAnnotate,
                          currentTask.auto_labels?.entities
                        );
                      })()}
                    </div>
                  </div>
                  
                  {/* Show task metadata if available */}
                  {currentTask.task_metadata && (
                    <div className="text-xs text-gray-500 mt-2">
                      <div>Source: {currentTask.task_metadata.source_file || 'Unknown'}</div>
                      {currentTask.task_metadata.sentence_index !== undefined && (
                        <div>Sentence {currentTask.task_metadata.sentence_index + 1} of {currentTask.task_metadata.total_sentences || '?'}</div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                currentTask?.text || 'No text available'
              )}
            </div>
          </div>

          {/* Confidence Score */}
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-600">Confidence:</span>
            <span className={`px-2 py-1 rounded text-sm font-medium ${getConfidenceColor(currentTask?.confidence_score || 0)}`}>
              {((currentTask?.confidence_score || 0) * 100).toFixed(0)}%
            </span>
            {currentTask?.auto_labels?.confidence_adjusted && (
              <span className="text-xs text-blue-600 bg-blue-100 px-2 py-1 rounded">
                ✨ Adjusted by learning
              </span>
            )}
          </div>
          
          {/* Learning Adjustment Details */}
          {currentTask?.auto_labels?.confidence_adjusted && (
            <div className="mt-2 text-xs text-blue-600">
              Original: {((currentTask.auto_labels.original_confidence || 0) * 100).toFixed(0)}% → 
              Adjusted: {((currentTask?.confidence_score || 0) * 100).toFixed(0)}% 
              (×{currentTask.auto_labels.adjustment_factor})
            </div>
          )}
        </div>

        {/* Labels Panel */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Auto-Generated Labels</h2>
          
          {/* Labels Display */}
          <div className="space-y-4 mb-6">
            {project.task_type === 'ner' && currentTask?.auto_labels && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-medium text-gray-900">Named Entities</h3>
                  <button
                    onClick={handleAddEntity}
                    className="text-sm bg-blue-100 hover:bg-blue-200 text-blue-700 px-3 py-1 rounded transition-colors"
                  >
                    + Add Entity
                  </button>
                </div>
                {(editedLabels?.entities || currentTask.auto_labels.entities) && (editedLabels?.entities?.length > 0 || currentTask.auto_labels.entities?.length > 0) ? (
                  <div className="space-y-2">
                  {(editedLabels?.entities || currentTask.auto_labels.entities || []).map((entity: any, index: number) => (
                    <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                      <div>
                        <span className={`entity-highlight entity-${entity.class_name}`}>
                          {entity.text}
                        </span>
                        <span className="ml-2 text-sm text-gray-600">({entity.class_name})</span>
                      </div>
                      <button 
                        onClick={() => handleRemoveEntity(index)}
                        className="text-red-500 hover:text-red-700 text-sm hover:bg-red-50 px-2 py-1 rounded transition-colors"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  </div>
                ) : (
                  <div className="text-gray-500 italic">No entities detected</div>
                )}
              </div>
            )}

            {project.task_type === 'sentiment' && currentTask?.auto_labels?.sentiment && (
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

            {project.task_type === 'classification' && currentTask?.auto_labels?.category && (
              <div>
                <h3 className="font-medium text-gray-900 mb-2">Classification</h3>
                <div className="p-3 bg-gray-50 rounded">
                  {/* Main Category Selection */}
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Primary Category:
                    </label>
                    <select
                      value={editedLabels?.category || currentTask.auto_labels?.category || 'electronics'}
                      onChange={(e) => setEditedLabels({
                        ...editedLabels,
                        category: e.target.value
                      })}
                      className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="electronics">Electronics</option>
                      <option value="beauty">Beauty</option>
                      <option value="home">Home</option>
                      <option value="clothing">Clothing</option>
                      <option value="books">Books</option>
                      <option value="automotive">Automotive</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  
                  {/* Confidence Scores */}
                  {currentTask.auto_labels.scores && (
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Confidence Scores:
                      </label>
                      {Object.entries(currentTask.auto_labels.scores).map(([category, score]) => (
                        <div key={category} className="flex items-center justify-between">
                          <span className="text-sm text-gray-600 capitalize">{category}:</span>
                          <div className="flex items-center space-x-2">
                            <input
                              type="range"
                              min="0"
                              max="1"
                              step="0.01"
                              value={editedLabels?.scores?.[category] || score}
                              onChange={(e) => setEditedLabels({
                                ...editedLabels,
                                scores: {
                                  ...editedLabels?.scores,
                                  [category]: parseFloat(e.target.value)
                                }
                              })}
                              className="w-20"
                            />
                            <span className="text-sm w-12 text-right">
                              {((editedLabels?.scores?.[category] || score) * 100).toFixed(0)}%
                            </span>
                          </div>
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

          {/* Learning Impact Indicator */}
          <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
              <span className="text-sm font-medium text-yellow-800">Learning Impact</span>
            </div>
            <div className="mt-2 text-xs text-yellow-700">
              {currentTask?.confidence_score && currentTask.confidence_score < 0.6 ? (
                <span>This low-confidence task will help improve the model when corrected</span>
              ) : currentTask?.confidence_score && currentTask.confidence_score < 0.8 ? (
                <span>This medium-confidence task provides valuable learning data</span>
              ) : (
                <span>This high-confidence task helps validate model accuracy</span>
              )}
            </div>
          </div>

          {/* Model Info */}
          <div className="mt-6 pt-4 border-t text-xs text-gray-500">
            <div>Model: {currentTask?.auto_labels?.model_used || 'Unknown'}</div>
            <div>Generated: {currentTask?.auto_labels?.timestamp ? 
              new Date(currentTask.auto_labels.timestamp).toLocaleString() : 'Unknown'}</div>
            {trainingStats && (
              <div className="mt-2 text-blue-600">
                Learning: {trainingStats.total_corrections}/{trainingStats.retrain_threshold} corrections
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
