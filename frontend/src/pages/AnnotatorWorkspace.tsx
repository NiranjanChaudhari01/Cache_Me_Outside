import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { taskApi, projectApi } from '../services/api';
import { Task, Project, Entity, TaskStatus } from '../types';

interface TrainingStats {
  total_corrections: number;
  corrections_by_type: { [key: string]: number };
}

const getLanguageFlag = (code: string): string => {
  const flagMap: { [key: string]: string } = {
    'en': '🇺🇸', 'es': '🇪🇸', 'fr': '🇫🇷', 'de': '🇩🇪', 'it': '🇮🇹', 'pt': '🇵🇹',
    'ru': '🇷🇺', 'zh': '🇨🇳', 'ja': '🇯🇵', 'ko': '🇰🇷', 'ar': '🇸🇦', 'nl': '🇳🇱',
    'el': '🇬🇷', 'pl': '🇵🇱', 'nb': '🇳🇴', 'sv': '🇸🇪', 'da': '🇩🇰', 'fi': '🇫🇮',
    'hu': '🇭🇺', 'ro': '🇷🇴', 'bg': '🇧🇬', 'hr': '🇭🇷', 'sl': '🇸🇮', 'lt': '🇱🇹',
    'lv': '🇱🇻', 'et': '🇪🇪', 'uk': '🇺🇦', 'mk': '🇲🇰', 'sr': '🇷🇸', 'bs': '🇧🇦',
    'me': '🇲🇪', 'sq': '🇦🇱', 'tr': '🇹🇷', 'he': '🇮🇱', 'hi': '🇮🇳', 'bn': '🇧🇩',
    'id': '🇮🇩', 'th': '🇹🇭', 'vi': '🇻🇳', 'uz': '🇺🇿', 'kk': '🇰🇿', 'ky': '🇰🇬',
    'tg': '🇹🇯', 'tk': '🇹🇲', 'az': '🇦🇿', 'ka': '🇬🇪', 'hy': '🇦🇲', 'mn': '🇲🇳',
    'km': '🇰🇭', 'lo': '🇱🇦', 'my': '🇲🇲', 'si': '🇱🇰', 'ne': '🇳🇵', 'dz': '🇧🇹',
    'dv': '🇲🇻', 'syl': '🇧🇩'
  };
  return flagMap[code] || '🌐';
};

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
  const [showEntityModal, setShowEntityModal] = useState(false);
  const [selectedText, setSelectedText] = useState('');
  const [selectedEntityType, setSelectedEntityType] = useState('PER');
  const [tempEntities, setTempEntities] = useState<any[]>([]);

  const currentTask = tasks[currentTaskIndex];
  const annotatorId = 1; // Demo annotator ID

  useEffect(() => {
    if (projectId) {
      loadProjectAndTasks();
    }
  }, [projectId]);

  // Global text selection listener
  useEffect(() => {
    const handleGlobalSelection = () => {
      if (showEntityModal) {
        handleTextSelection();
      }
    };

    document.addEventListener('selectionchange', handleGlobalSelection);
    return () => {
      document.removeEventListener('selectionchange', handleGlobalSelection);
    };
  }, [showEntityModal]);

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
      setTrainingStats(data.training_stats);
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
        
        // Show feedback for corrections
        setLastCorrection(`Labels corrected for task ${currentTask.id} • Added to learning data`);
        
        // Reload training stats to show updated counts
        setTimeout(() => {
          loadTrainingStats();
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
    setShowEntityModal(true);
    setSelectedText('');
    // Set default entity type to first available class for this project
    const defaultEntityType = project?.entity_classes?.[0] || 'PER';
    setSelectedEntityType(defaultEntityType);
    setTempEntities([]);
  };

  const handleTextSelection = () => {
    const selection = window.getSelection();
    if (selection && selection.toString().trim()) {
      const selectedText = selection.toString().trim();
      console.log('🎯 Text selected:', selectedText);
      setSelectedText(selectedText);
    }
  };

  const handleMouseUp = (event: React.MouseEvent<HTMLSpanElement>) => {
    // Small delay to ensure selection is complete
    setTimeout(() => {
      handleTextSelection();
    }, 10);
  };

  const addTempEntity = () => {
    if (!selectedText.trim()) {
      alert('Please select some text first');
      return;
    }

    const fullText = currentTask.task_metadata?.full_text || currentTask.text;
    const startIndex = fullText.indexOf(selectedText);
    
    if (startIndex === -1) {
      alert('Selected text not found in full text');
      return;
    }

    const newEntity = {
      class_name: selectedEntityType,
      start_index: startIndex,
      end_index: startIndex + selectedText.length,
      text: selectedText,
      original_label: selectedEntityType === 'PER' ? 'PERSON' : 'LOCATION'
    };

    setTempEntities([...tempEntities, newEntity]);
    setSelectedText('');
  };

  const removeTempEntity = (index: number) => {
    setTempEntities(tempEntities.filter((_, i) => i !== index));
  };

  const submitEntities = () => {
    if (tempEntities.length === 0) {
      alert('Please add at least one entity');
      return;
    }

    const currentEntities = editedLabels?.entities || currentTask?.auto_labels?.entities || [];
    const updatedEntities = [...currentEntities, ...tempEntities];
    
    const baseLabels = editedLabels || currentTask?.auto_labels || {};
    const updatedLabels = {
      ...baseLabels,
      entities: updatedEntities,
      entity_count: updatedEntities.length,
      entity_types: Array.from(new Set(updatedEntities.map((ent: any) => ent.class_name)))
    };
    
    setEditedLabels(updatedLabels);
    setShowEntityModal(false);
    setTempEntities([]);
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
                  <span className="text-sm font-medium text-blue-900">Correction Tracking</span>
                </div>
                <div className="text-sm text-blue-700">
                  {trainingStats.total_corrections} corrections made
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-600">Total Corrections:</span>
                    <span className="ml-2 font-medium">{trainingStats.total_corrections}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Status:</span>
                    <span className="ml-2 font-medium text-green-600">Active</span>
                  </div>
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
                
              </div>
            )}
          </div>
        )}
        
        {/* Correction Feedback Notification */}
        {showLearningFeedback && lastCorrection && (
          <div className="mt-3 p-3 rounded-lg border bg-green-50 border-green-200">
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 rounded-full bg-green-500"></div>
              <span className="text-sm text-green-800">
                {lastCorrection}
              </span>
            </div>
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
              {currentTask ? (
                <div className="space-y-2">
                  {/* Full text with highlighted portion */}
                  <div className="bg-gray-50 border border-gray-200 p-4 rounded">
                    <div className="text-sm text-gray-600 font-medium mb-2">Full Text with Highlighted Annotation Target:</div>
                    <div 
                      className="text-gray-900 leading-relaxed whitespace-pre-wrap break-words select-text cursor-text"
                      onMouseUp={handleMouseUp}
                      onSelect={handleTextSelection}
                      style={{ userSelect: 'text' }}
                    >
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
                'No text available'
              )}
            </div>
          </div>

        </div>

        {/* Labels Panel */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Auto-Generated Labels</h2>
          
          {/* Labels Display */}
          <div className="space-y-4 mb-6">
            {currentTask?.auto_labels && (
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

            {/* Only NER is supported - sentiment and classification components removed */}
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
              <span className="text-sm font-medium text-yellow-800">Correction Tracking</span>
            </div>
            <div className="mt-2 text-xs text-yellow-700">
              <span>Your corrections are tracked for system analytics</span>
            </div>
          </div>

          {/* Model Info */}
          <div className="mt-6 pt-4 border-t text-xs text-gray-500">
            <div>Model: {currentTask?.auto_labels?.model_used || 'Unknown'}</div>
            <div>Language: {project?.language ? 
              `${getLanguageFlag(project.language)} ${project.language.toUpperCase()}` : 'Unknown'}</div>
            <div>Generated: {currentTask?.auto_labels?.timestamp ? 
              new Date(currentTask.auto_labels.timestamp).toLocaleString() : 'Unknown'}</div>
            {trainingStats && (
              <div className="mt-2 text-blue-600">
                Training: {trainingStats.total_corrections} corrections
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Entity Addition Modal */}
      {showEntityModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-gray-900">Add New Entities</h2>
                <button
                  onClick={() => setShowEntityModal(false)}
                  className="text-gray-400 hover:text-gray-600 text-2xl"
                >
                  ×
                </button>
              </div>

              {/* Instructions */}
              <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-800">
                  <strong>Instructions:</strong> Select text from the full text below by dragging your cursor, then choose an entity type and click "Add Entity".
                </p>
              </div>

              {/* Project Entity Classes Info */}
              <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-center mb-2">
                  <span className="text-sm font-medium text-green-800">Project Entity Classes:</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(!project?.entity_classes || project.entity_classes.length === 0) ? (
                    <>
                      <span className="px-2 py-1 text-xs font-medium rounded-full border bg-blue-100 text-blue-800 border-blue-300">PER - Person</span>
                      <span className="px-2 py-1 text-xs font-medium rounded-full border bg-green-100 text-green-800 border-green-300">LOC - Location</span>
                      <span className="px-2 py-1 text-xs font-medium rounded-full border bg-purple-100 text-purple-800 border-purple-300">ORG - Organization</span>
                    </>
                  ) : (
                    project.entity_classes.map((entityClass) => {
                      const colors = {
                        'PER': 'bg-blue-100 text-blue-800 border-blue-300',
                        'LOC': 'bg-green-100 text-green-800 border-green-300',
                        'ORG': 'bg-purple-100 text-purple-800 border-purple-300'
                      };
                      const labels = {
                        'PER': 'Person',
                        'LOC': 'Location', 
                        'ORG': 'Organization'
                      };
                      return (
                        <span
                          key={entityClass}
                          className={`px-2 py-1 text-xs font-medium rounded-full border ${colors[entityClass as keyof typeof colors]}`}
                        >
                          {entityClass} - {labels[entityClass as keyof typeof labels]}
                        </span>
                      );
                    })
                  )}
                </div>
                <p className="text-xs text-green-700 mt-1">
                  {(!project?.entity_classes || project.entity_classes.length === 0) 
                    ? 'All entity types are available for annotation.' 
                    : 'Only these entity types can be annotated in this project.'}
                </p>
              </div>

              {/* Full Text Display in Modal */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Full Text with Highlighted Annotation Target:
                </label>
                <div 
                  className="p-4 bg-gray-50 border border-gray-300 rounded-lg text-gray-900 leading-relaxed whitespace-pre-wrap break-words select-text cursor-text max-h-48 overflow-y-auto"
                  onMouseUp={handleMouseUp}
                  onSelect={handleTextSelection}
                  style={{ userSelect: 'text' }}
                >
                  {(() => {
                    const fullText = currentTask.task_metadata?.full_text || currentTask.text;
                    const textToAnnotate = currentTask.text;
                    
                    return renderFullTextWithHighlight(
                      fullText,
                      textToAnnotate,
                      currentTask.auto_labels?.entities
                    );
                  })()}
                </div>
              </div>

              {/* Text Selection Area */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Selected Text:
                </label>
                <div className="p-3 bg-gray-50 border border-gray-300 rounded-lg min-h-[40px] mb-2">
                  {selectedText ? (
                    <span className="text-gray-900 font-medium">{selectedText}</span>
                  ) : (
                    <span className="text-gray-500 italic">No text selected. Select text from the main text area above or type manually below.</span>
                  )}
                </div>
                
                {/* Manual Text Input */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Or type text manually:
                  </label>
                  <input
                    type="text"
                    value={selectedText}
                    onChange={(e) => setSelectedText(e.target.value)}
                    placeholder="Type the text you want to mark as an entity..."
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Entity Type Selection */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Entity Type:
                </label>
                <div className="mb-2">
                  <p className="text-xs text-gray-600">
                    <strong>Available for this project:</strong> {project?.entity_classes?.join(', ') || 'PER, LOC, ORG'}
                  </p>
                </div>
                <select
                  value={selectedEntityType}
                  onChange={(e) => setSelectedEntityType(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  {(!project?.entity_classes || project.entity_classes.length === 0) ? (
                    <>
                      <option value="PER">PER - Person</option>
                      <option value="LOC">LOC - Location</option>
                      <option value="ORG">ORG - Organization</option>
                    </>
                  ) : (
                    <>
                      {project.entity_classes.includes('PER') && <option value="PER">PER - Person</option>}
                      {project.entity_classes.includes('LOC') && <option value="LOC">LOC - Location</option>}
                      {project.entity_classes.includes('ORG') && <option value="ORG">ORG - Organization</option>}
                    </>
                  )}
                </select>
              </div>

              {/* Add Entity Button */}
              <div className="mb-4">
                <button
                  onClick={addTempEntity}
                  disabled={!selectedText.trim()}
                  className="w-full bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 text-white py-2 px-4 rounded-lg font-medium transition-colors"
                >
                  Add Entity
                </button>
              </div>

              {/* Temporary Entities List */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Entities to Add ({tempEntities.length}):
                </label>
                <div className="max-h-48 overflow-y-auto border border-gray-300 rounded-lg">
                  {tempEntities.length === 0 ? (
                    <div className="p-4 text-center text-gray-500 italic">
                      No entities added yet
                    </div>
                  ) : (
                    tempEntities.map((entity, index) => (
                      <div key={index} className="flex items-center justify-between p-3 border-b border-gray-200 last:border-b-0">
                        <div className="flex-1">
                          <span className="font-medium text-gray-900">{entity.text}</span>
                          <span className="ml-2 text-sm text-gray-600">({entity.class_name})</span>
                        </div>
                        <button
                          onClick={() => removeTempEntity(index)}
                          className="text-red-500 hover:text-red-700 text-sm hover:bg-red-50 px-2 py-1 rounded transition-colors"
                        >
                          Remove
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex space-x-3">
                <button
                  onClick={() => setShowEntityModal(false)}
                  className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-700 py-2 px-4 rounded-lg font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={submitEntities}
                  disabled={tempEntities.length === 0}
                  className="flex-1 bg-green-500 hover:bg-green-600 disabled:bg-gray-300 text-white py-2 px-4 rounded-lg font-medium transition-colors"
                >
                  Submit Entities ({tempEntities.length})
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
