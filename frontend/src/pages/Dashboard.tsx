import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { projectApi } from '../services/api';
import { Project, ProjectStats } from '../types';

export const Dashboard: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectStats, setProjectStats] = useState<{ [key: number]: ProjectStats }>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      const projectsData = await projectApi.getAll();
      setProjects(projectsData);
      
      // Load stats for each project
      const statsPromises = projectsData.map(async (project) => {
        try {
          const stats = await projectApi.getStats(project.id);
          return { projectId: project.id, stats };
        } catch (error) {
          console.error(`Error loading stats for project ${project.id}:`, error);
          return { projectId: project.id, stats: null };
        }
      });
      
      const statsResults = await Promise.all(statsPromises);
      const statsMap: { [key: number]: ProjectStats } = {};
      
      statsResults.forEach(({ projectId, stats }) => {
        if (stats) {
          statsMap[projectId] = stats;
        }
      });
      
      setProjectStats(statsMap);
    } catch (error) {
      console.error('Error loading projects:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleExportProject = async (projectId: number) => {
    try {
      const data = await projectApi.exportData(projectId);
      
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
      
      alert(`✅ Exported ${data.count} annotated tasks for project ${projectId}!`);
    } catch (error) {
      console.error('Error exporting data:', error);
      alert('❌ Error exporting data. Please try again.');
    }
  };

  const getStatusColor = (completionRate: number) => {
    if (completionRate >= 80) return 'text-green-600 bg-green-100';
    if (completionRate >= 50) return 'text-yellow-600 bg-yellow-100';
    return 'text-red-600 bg-red-100';
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'text-green-600';
    if (confidence >= 0.6) return 'text-yellow-600';
    return 'text-red-600';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-600 mt-2">Manage your annotation projects</p>
        </div>
        <Link
          to="/setup"
          className="bg-primary-500 hover:bg-primary-600 text-white px-6 py-3 rounded-lg font-medium transition-colors"
        >
          New Project
        </Link>
      </div>

      {/* Projects Grid */}
      {projects.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-24 h-24 mx-auto bg-gray-100 rounded-full flex items-center justify-center mb-4">
            <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No projects yet</h3>
          <p className="text-gray-600 mb-6">Create your first annotation project to get started</p>
          <Link
            to="/setup"
            className="bg-primary-500 hover:bg-primary-600 text-white px-6 py-3 rounded-lg font-medium transition-colors"
          >
            Create Project
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map((project) => {
            const stats = projectStats[project.id];
            return (
              <div key={project.id} className="bg-white rounded-lg shadow-md border hover:shadow-lg transition-shadow">
                <div className="p-6">
                  {/* Project Header */}
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-1">{project.name}</h3>
                      <span className="inline-block px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded-full">
                        {project.task_type.toUpperCase()}
                      </span>
                    </div>
                    {stats && (
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(stats.completion_rate)}`}>
                        {stats.completion_rate.toFixed(0)}% Complete
                      </span>
                    )}
                  </div>

                  {/* Project Description */}
                  {project.description && (
                    <p className="text-gray-600 text-sm mb-4 line-clamp-2">{project.description}</p>
                  )}

                  {/* Stats */}
                  {stats && (
                    <div className="space-y-3 mb-6">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Total Tasks:</span>
                        <span className="font-medium">{stats.total_tasks}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Pending Client Review:</span>
                        <span className="font-medium text-yellow-600">{stats.reviewed}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Approved:</span>
                        <span className="font-medium text-green-600">{stats.approved}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Rejected:</span>
                        <span className="font-medium text-red-600">{stats.rejected}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Avg Confidence:</span>
                        <span className={`font-medium ${getConfidenceColor(stats.average_confidence)}`}>
                          {(stats.average_confidence * 100).toFixed(0)}%
                        </span>
                      </div>
                      
                      {/* Progress Bar */}
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-primary-500 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${stats.completion_rate}%` }}
                        ></div>
                      </div>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="space-y-2">
                    <div className="flex space-x-2">
                      <Link
                        to={`/annotate/${project.id}`}
                        className="flex-1 bg-primary-500 hover:bg-primary-600 text-white text-center py-2 px-4 rounded-md text-sm font-medium transition-colors"
                      >
                        Annotate
                      </Link>
                      <Link
                        to={`/client/${project.id}`}
                        className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-center py-2 px-4 rounded-md text-sm font-medium transition-colors"
                      >
                        Client View
                      </Link>
                    </div>
                    <button
                      onClick={() => handleExportProject(project.id)}
                      className="w-full bg-green-500 hover:bg-green-600 text-white text-center py-2 px-4 rounded-md text-sm font-medium transition-colors"
                    >
                      📥 Export Data
                    </button>
                  </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-3 bg-gray-50 border-t text-xs text-gray-500">
                  Created {new Date(project.created_at).toLocaleDateString()}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
