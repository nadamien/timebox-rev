import React, { useState, useEffect, useRef } from 'react';
import { Plus, Clock, Trash2, Play, Pause, CheckCircle, Edit3, Eye, Calendar, Target } from 'lucide-react';
import { dbOperations, Task } from './database';
import './App.css';

const TimeBoxApp = () => {
  const [tasks, setTasks] = useState([]);
  const [timeSlots, setTimeSlots] = useState([]);
  const [draggedTask, setDraggedTask] = useState(null);
  const [draggedSlot, setDraggedSlot] = useState(null);
  const [isAdding, setIsAdding] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDescription, setNewTaskDescription] = useState('');
  const [newTaskDuration, setNewTaskDuration] = useState(30);
  const [newTaskPriority, setNewTaskPriority] = useState('medium');
  const [newTaskCategory, setNewTaskCategory] = useState('general');
  const [activeTimer, setActiveTimer] = useState(null);
  const [activeSession, setActiveSession] = useState(null);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [selectedTask, setSelectedTask] = useState(null);
  const [showTaskDetails, setShowTaskDetails] = useState(false);
  const timerRef = useRef(null);

  // Generate time slots from 6 AM to 11 PM in 30-minute intervals
  const generateTimeSlots = () => {
    const slots = [];
    for (let hour = 6; hour < 23; hour++) {
      for (let minute = 0; minute < 60; minute += 30) {
        const timeString = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
        slots.push({
          id: `${hour}-${minute}`,
          time: timeString,
          task: null,
          duration: 30
        });
      }
    }
    return slots;
  };

  useEffect(() => {
    // Initialize time slots
    const initialSlots = generateTimeSlots();
    setTimeSlots(initialSlots);
    
    // Load data from database
    loadTasks();
    loadTimeSlots();
  }, []);

  useEffect(() => {
    // Save time slots to database when they change
    if (timeSlots.length > 0) {
      dbOperations.saveTimeSlots(timeSlots);
    }
  }, [timeSlots]);

  useEffect(() => {
    if (activeTimer && timerSeconds > 0) {
      timerRef.current = setInterval(() => {
        setTimerSeconds(prev => {
          if (prev <= 1) {
            endTimerSession();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [activeTimer, timerSeconds]);

  const loadTasks = async () => {
    try {
      const dbTasks = await dbOperations.getTasks();
      setTasks(dbTasks);
    } catch (error) {
      console.error('Error loading tasks:', error);
    }
  };

  const loadTimeSlots = async () => {
    try {
      const dbSlots = await dbOperations.getTimeSlots();
      if (dbSlots.length > 0) {
        const dbTasks = await dbOperations.getTasks();
        const slotsWithTasks = generateTimeSlots().map(slot => {
          const dbSlot = dbSlots.find(db => db.slotId === slot.id);
          if (dbSlot && dbSlot.taskId) {
            const task = dbTasks.find(t => t.id === dbSlot.taskId);
            return { ...slot, task };
          }
          return slot;
        });
        setTimeSlots(slotsWithTasks);
      }
    } catch (error) {
      console.error('Error loading time slots:', error);
    }
  };

  const addTask = async () => {
    if (newTaskTitle.trim()) {
      try {
        const task = new Task(
          newTaskTitle.trim(),
          newTaskDescription.trim(),
          newTaskDuration,
          newTaskPriority,
          newTaskCategory
        );
        
        const id = await dbOperations.addTask(task);
        const newTask = { ...task, id };
        
        setTasks([newTask, ...tasks]);
        setNewTaskTitle('');
        setNewTaskDescription('');
        setNewTaskDuration(30);
        setNewTaskPriority('medium');
        setNewTaskCategory('general');
        setIsAdding(false);
      } catch (error) {
        console.error('Error adding task:', error);
      }
    }
  };

  const deleteTask = async (taskId) => {
    try {
      await dbOperations.deleteTask(taskId);
      setTasks(tasks.filter(task => task.id !== taskId));
      // Remove from time slots
      setTimeSlots(timeSlots.map(slot => 
        slot.task?.id === taskId ? { ...slot, task: null } : slot
      ));
    } catch (error) {
      console.error('Error deleting task:', error);
    }
  };

  const toggleTaskComplete = async (taskId) => {
    try {
      const task = tasks.find(t => t.id === taskId);
      const newCompletedState = !task.completed;
      
      await dbOperations.updateTask(taskId, { 
        completed: newCompletedState,
        completedAt: newCompletedState ? new Date() : null
      });
      
      setTasks(tasks.map(task => 
        task.id === taskId ? { 
          ...task, 
          completed: newCompletedState,
          completedAt: newCompletedState ? new Date() : null
        } : task
      ));
    } catch (error) {
      console.error('Error toggling task completion:', error);
    }
  };

  const startTimer = async (slotId) => {
    const slot = timeSlots.find(s => s.id === slotId);
    if (slot && slot.task && !slot.task.completed) {
      try {
        const sessionId = await dbOperations.startSession(slot.task.id);
        setActiveTimer(slotId);
        setActiveSession(sessionId);
        setTimerSeconds(slot.task.duration * 60);
      } catch (error) {
        console.error('Error starting timer:', error);
      }
    }
  };

  const stopTimer = async () => {
    if (activeSession) {
      try {
        await dbOperations.endSession(activeSession, 'Manually stopped');
      } catch (error) {
        console.error('Error ending session:', error);
      }
    }
    setActiveTimer(null);
    setActiveSession(null);
    setTimerSeconds(0);
  };

  const endTimerSession = async () => {
    if (activeSession) {
      try {
        await dbOperations.endSession(activeSession, 'Timer completed');
        // Auto-complete the task if timer finished
        const slot = timeSlots.find(s => s.id === activeTimer);
        if (slot && slot.task) {
          await toggleTaskComplete(slot.task.id);
        }
      } catch (error) {
        console.error('Error ending timer session:', error);
      }
    }
    setActiveTimer(null);
    setActiveSession(null);
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDuration = (minutes) => {
    if (minutes >= 60) {
      const hours = Math.floor(minutes / 60);
      const remainingMins = minutes % 60;
      if (remainingMins === 0) {
        return `${hours}h`;
      }
      return `${hours}h ${remainingMins}m`;
    }
    return `${minutes}m`;
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'high': return 'text-red-400 border-red-400';
      case 'medium': return 'text-yellow-400 border-yellow-400';
      case 'low': return 'text-green-400 border-green-400';
      default: return 'text-gray-400 border-gray-400';
    }
  };

  const showTaskDetailsModal = (task) => {
    setSelectedTask(task);
    setShowTaskDetails(true);
  };

  // Drag and drop handlers
  const handleDragStart = (e, task, isFromSlot = false) => {
    if (isFromSlot) {
      setDraggedSlot(task);
    } else {
      setDraggedTask(task);
    }
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDragEnter = (e) => {
    e.preventDefault();
    e.target.closest('.drop-zone')?.classList.add('drag-over');
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    if (!e.currentTarget.contains(e.relatedTarget)) {
      e.target.closest('.drop-zone')?.classList.remove('drag-over');
    }
  };

  const handleDrop = (e, slotId) => {
    e.preventDefault();
    e.target.closest('.drop-zone')?.classList.remove('drag-over');
    
    if (draggedTask) {
      // Assign task to time slot
      setTimeSlots(timeSlots.map(slot => {
        if (slot.id === slotId) {
          return { ...slot, task: draggedTask };
        }
        return slot;
      }));
    } else if (draggedSlot) {
      // Move task between slots or back to unscheduled
      if (slotId === 'unscheduled') {
        // Remove from current slot
        setTimeSlots(timeSlots.map(slot => 
          slot.task?.id === draggedSlot.id ? { ...slot, task: null } : slot
        ));
      } else {
        // Move to new slot
        setTimeSlots(timeSlots.map(slot => {
          if (slot.id === slotId) {
            return { ...slot, task: draggedSlot };
          }
          if (slot.task?.id === draggedSlot.id) {
            return { ...slot, task: null };
          }
          return slot;
        }));
      }
    }
    
    setDraggedTask(null);
    setDraggedSlot(null);
  };

  const completeAllTasks = async () => {
    try {
      const incompleteTasks = tasks.filter(task => !task.completed);
      for (const task of incompleteTasks) {
        await dbOperations.updateTask(task.id, { 
          completed: true, 
          completedAt: new Date() 
        });
      }
      setTasks(tasks.map(task => ({ 
        ...task, 
        completed: true, 
        completedAt: new Date() 
      })));
    } catch (error) {
      console.error('Error completing all tasks:', error);
    }
  };

  const resetAllTasks = async () => {
    try {
      const completedTasks = tasks.filter(task => task.completed);
      for (const task of completedTasks) {
        await dbOperations.updateTask(task.id, { 
          completed: false, 
          completedAt: null 
        });
      }
      setTasks(tasks.map(task => ({ 
        ...task, 
        completed: false, 
        completedAt: null 
      })));
    } catch (error) {
      console.error('Error resetting all tasks:', error);
    }
  };

  const unscheduledTasks = tasks.filter(task => 
    !timeSlots.some(slot => slot.task?.id === task.id)
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white">
      {/* Header */}
      <div className="sticky top-0 bg-black/20 backdrop-blur-lg border-b border-white/10 p-4 z-10">
        <h1 className="text-2xl font-bold text-center flex items-center justify-center gap-2">
          <Clock className="w-6 h-6 text-purple-400" />
          TimeBox Pro
        </h1>
        <p className="text-center text-purple-200 text-sm mt-1">Advanced time management with detailed tracking</p>
      </div>

      <div className="p-4 max-w-md mx-auto space-y-6">
        {/* Unscheduled Tasks */}
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-4 border border-white/20">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-purple-200">Tasks</h2>
            <button
              onClick={() => setIsAdding(true)}
              className="w-8 h-8 bg-purple-500 rounded-full flex items-center justify-center hover:bg-purple-600 transition-colors btn-hover"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          {isAdding && (
            <div className="mb-3 space-y-3 p-3 bg-white/5 rounded-lg border border-white/10">
              <input
                type="text"
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                placeholder="Task title *"
                className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-purple-500 custom-input"
                autoFocus
              />
              <textarea
                value={newTaskDescription}
                onChange={(e) => setNewTaskDescription(e.target.value)}
                placeholder="Description (optional)"
                className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-purple-500 custom-input resize-none"
                rows="2"
              />
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={newTaskDuration}
                  onChange={(e) => setNewTaskDuration(parseInt(e.target.value))}
                  className="px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500 custom-input"
                >
                  <option value={15} className="bg-gray-800">15 min</option>
                  <option value={30} className="bg-gray-800">30 min</option>
                  <option value={45} className="bg-gray-800">45 min</option>
                  <option value={60} className="bg-gray-800">1 hour</option>
                  <option value={90} className="bg-gray-800">1.5 hours</option>
                  <option value={120} className="bg-gray-800">2 hours</option>
                  <option value={180} className="bg-gray-800">3 hours</option>
                </select>
                <select
                  value={newTaskPriority}
                  onChange={(e) => setNewTaskPriority(e.target.value)}
                  className="px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500 custom-input"
                >
                  <option value="low" className="bg-gray-800">Low Priority</option>
                  <option value="medium" className="bg-gray-800">Medium Priority</option>
                  <option value="high" className="bg-gray-800">High Priority</option>
                </select>
              </div>
              <select
                value={newTaskCategory}
                onChange={(e) => setNewTaskCategory(e.target.value)}
                className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500 custom-input"
              >
                <option value="general" className="bg-gray-800">General</option>
                <option value="work" className="bg-gray-800">Work</option>
                <option value="personal" className="bg-gray-800">Personal</option>
                <option value="health" className="bg-gray-800">Health</option>
                <option value="learning" className="bg-gray-800">Learning</option>
                <option value="social" className="bg-gray-800">Social</option>
              </select>
              <div className="flex gap-2">
                <button
                  onClick={() => setIsAdding(false)}
                  className="flex-1 py-2 px-3 bg-gray-500/20 border border-gray-500/30 rounded-lg text-gray-200 text-sm hover:bg-gray-500/30 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={addTask}
                  disabled={!newTaskTitle.trim()}
                  className="flex-1 py-2 px-3 bg-green-500/20 border border-green-500/30 rounded-lg text-green-200 text-sm hover:bg-green-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Add Task
                </button>
              </div>
            </div>
          )}

          <div 
            className="drop-zone space-y-2 min-h-[60px] border-2 border-dashed border-white/20 rounded-lg p-2"
            onDragOver={handleDragOver}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, 'unscheduled')}
          >
            {unscheduledTasks.map(task => (
              <div
                key={task.id}
                draggable
                onDragStart={(e) => handleDragStart(e, task)}
                className={`${task.color} p-3 rounded-lg cursor-move transition-transform flex items-center justify-between group task-card`}
              >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <div className="flex flex-col min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`font-medium ${task.completed ? 'line-through opacity-50' : ''} truncate`}>
                        {task.title}
                      </span>
                      <span className={`text-xs border px-1.5 py-0.5 rounded ${getPriorityColor(task.priority)}`}>
                        {task.priority.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    {task.description && (
                      <span className="text-xs text-white/70 truncate mt-1">
                        {task.description}
                      </span>
                    )}
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs bg-black/20 px-1.5 py-0.5 rounded">
                        {formatDuration(task.duration)}
                      </span>
                      <span className="text-xs bg-black/20 px-1.5 py-0.5 rounded capitalize">
                        {task.category}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => showTaskDetailsModal(task)}
                    className="opacity-70 hover:opacity-100 transition-opacity p-1 hover:bg-white/20 rounded"
                    title="View details"
                  >
                    <Eye className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => toggleTaskComplete(task.id)}
                    className={`w-6 h-6 rounded-full border-2 border-white flex items-center justify-center transition-colors ${
                      task.completed ? 'bg-white' : 'bg-transparent hover:bg-white/20'
                    }`}
                    title={task.completed ? 'Mark incomplete' : 'Mark complete'}
                  >
                    {task.completed && <CheckCircle className="w-3 h-3 text-gray-800" />}
                  </button>
                  <button
                    onClick={() => deleteTask(task.id)}
                    className="opacity-70 hover:opacity-100 transition-opacity p-1 hover:bg-red-500/20 rounded"
                    title="Delete task"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
            {unscheduledTasks.length === 0 && (
              <div className="text-center text-white/50 py-4">
                Drag tasks here or add new ones
              </div>
            )}
          </div>
        </div>

        {/* Active Timer */}
        {activeTimer && (
          <div className="bg-green-500/20 backdrop-blur-lg rounded-2xl p-4 border border-green-500/30 timer-pulse">
            <div className="text-center">
              <div className="text-3xl font-mono font-bold text-green-400 mb-2">
                {formatTime(timerSeconds)}
              </div>
              <div className="text-green-200 mb-1">
                {timeSlots.find(s => s.id === activeTimer)?.task?.title}
              </div>
              <div className="text-xs text-green-300 mb-3">
                Session in progress...
              </div>
              <button
                onClick={stopTimer}
                className="bg-red-500 hover:bg-red-600 px-4 py-2 rounded-lg transition-colors flex items-center gap-2 mx-auto btn-hover"
              >
                <Pause className="w-4 h-4" />
                Stop Timer
              </button>
            </div>
          </div>
        )}

        {/* Schedule */}
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-4 border border-white/20">
          <h2 className="text-lg font-semibold text-purple-200 mb-3">Schedule</h2>
          
          <div className="space-y-1 max-h-80 overflow-y-auto scroll-area">
            {timeSlots.map(slot => (
              <div
                key={slot.id}
                className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 transition-colors time-slot"
              >
                <div className="text-sm text-purple-300 w-14 font-mono flex-shrink-0">
                  {slot.time}
                </div>
                
                <div 
                  className="drop-zone flex-1 min-h-[44px] border-2 border-dashed border-white/20 rounded-lg flex items-center"
                  onDragOver={handleDragOver}
                  onDragEnter={handleDragEnter}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, slot.id)}
                >
                  {slot.task ? (
                    <div
                      draggable
                      onDragStart={(e) => handleDragStart(e, slot.task, true)}
                      className={`${slot.task.color} p-2 rounded-lg cursor-move transition-transform flex items-center justify-between w-full group task-card`}
                    >
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <div className="flex flex-col min-w-0 flex-1">
                          <div className="flex items-center gap-1">
                            <span className={`font-medium text-sm ${slot.task.completed ? 'line-through opacity-50' : ''} truncate`}>
                              {slot.task.title}
                            </span>
                            <span className={`text-xs border px-1 py-0.5 rounded ${getPriorityColor(slot.task.priority)}`}>
                              {slot.task.priority.charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <span className="text-xs bg-black/20 px-1.5 py-0.5 rounded mt-1 w-fit">
                            {formatDuration(slot.task.duration)}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => showTaskDetailsModal(slot.task)}
                          className="opacity-70 hover:opacity-100 transition-opacity p-1 hover:bg-white/20 rounded"
                          title="View details"
                        >
                          <Eye className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => toggleTaskComplete(slot.task.id)}
                          className={`w-5 h-5 rounded-full border border-white flex items-center justify-center transition-colors ${
                            slot.task.completed ? 'bg-white' : 'bg-transparent hover:bg-white/20'
                          }`}
                          title={slot.task.completed ? 'Mark incomplete' : 'Mark complete'}
                        >
                          {slot.task.completed && <CheckCircle className="w-3 h-3 text-gray-800" />}
                        </button>
                        <button
                          onClick={() => startTimer(slot.id)}
                          disabled={activeTimer !== null || slot.task.completed}
                          className="opacity-70 hover:opacity-100 transition-opacity p-1 disabled:opacity-30 hover:bg-white/20 rounded"
                          title="Start timer"
                        >
                          <Play className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-white/30 text-sm p-2 w-full text-center">
                      Drop task here
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Stats */}
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-4 border border-white/20">
          <h3 className="text-lg font-semibold text-purple-200 mb-3">Today's Progress</h3>
          
          {/* Progress Bar */}
          {tasks.length > 0 && (
            <div className="mb-4">
              <div className="flex justify-between text-sm text-purple-200 mb-2">
                <span>Completion</span>
                <span>{Math.round((tasks.filter(task => task.completed).length / tasks.length) * 100)}%</span>
              </div>
              <div className="w-full bg-white/10 rounded-full h-2">
                <div 
                  className="bg-gradient-to-r from-green-500 to-blue-500 h-2 rounded-full transition-all duration-500 progress-bar"
                  style={{ width: `${(tasks.filter(task => task.completed).length / tasks.length) * 100}%` }}
                ></div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="text-center stat-card bg-white/5 p-3 rounded-lg">
              <div className="text-2xl font-bold text-blue-400">
                {timeSlots.filter(slot => slot.task).length}
              </div>
              <div className="text-sm text-white/70">Scheduled</div>
            </div>
            <div className="text-center stat-card bg-white/5 p-3 rounded-lg">
              <div className="text-2xl font-bold text-green-400">
                {tasks.filter(task => task.completed).length}/{tasks.length}
              </div>
              <div className="text-sm text-white/70">Completed</div>
            </div>
          </div>
          
          {/* Quick Actions */}
          {tasks.length > 0 && (
            <div className="flex gap-2">
              <button
                onClick={completeAllTasks}
                disabled={tasks.every(task => task.completed)}
                className="flex-1 py-2 px-3 bg-green-500/20 border border-green-500/30 rounded-lg text-green-200 text-sm hover:bg-green-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                ✓ Complete All
              </button>
              <button
                onClick={resetAllTasks}
                disabled={tasks.every(task => !task.completed)}
                className="flex-1 py-2 px-3 bg-yellow-500/20 border border-yellow-500/30 rounded-lg text-yellow-200 text-sm hover:bg-yellow-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                ↻ Reset All
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Task Details Modal */}
      {showTaskDetails && selectedTask && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20 max-w-md w-full max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-white">Task Details</h3>
              <button
                onClick={() => setShowTaskDetails(false)}
                className="w-8 h-8 bg-white/10 rounded-full flex items-center justify-center hover:bg-white/20 transition-colors"
              >
                ✕
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="text-sm text-purple-200 mb-1 block">Title</label>
                <div className={`p-3 rounded-lg ${selectedTask.color} text-white font-medium`}>
                  {selectedTask.title}
                </div>
              </div>
              
              {selectedTask.description && (
                <div>
                  <label className="text-sm text-purple-200 mb-1 block">Description</label>
                  <div className="p-3 bg-white/5 rounded-lg text-white">
                    {selectedTask.description}
                  </div>
                </div>
              )}
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-purple-200 mb-1 block">Duration</label>
                  <div className="p-2 bg-white/5 rounded-lg text-white text-center">
                    {formatDuration(selectedTask.duration)}
                  </div>
                </div>
                <div>
                  <label className="text-sm text-purple-200 mb-1 block">Priority</label>
                  <div className={`p-2 bg-white/5 rounded-lg text-center capitalize ${getPriorityColor(selectedTask.priority)}`}>
                    {selectedTask.priority}
                  </div>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-purple-200 mb-1 block">Category</label>
                  <div className="p-2 bg-white/5 rounded-lg text-white text-center capitalize">
                    {selectedTask.category}
                  </div>
                </div>
                <div>
                  <label className="text-sm text-purple-200 mb-1 block">Status</label>
                  <div className={`p-2 bg-white/5 rounded-lg text-center ${
                    selectedTask.completed ? 'text-green-400' : 'text-yellow-400'
                  }`}>
                    {selectedTask.completed ? 'Completed' : 'Pending'}
                  </div>
                </div>
              </div>
              
              <div>
                <label className="text-sm text-purple-200 mb-1 block">Created</label>
                <div className="p-2 bg-white/5 rounded-lg text-white text-sm">
                  {new Date(selectedTask.createdAt).toLocaleString()}
                </div>
              </div>
              
              {selectedTask.completedAt && (
                <div>
                  <label className="text-sm text-purple-200 mb-1 block">Completed</label>
                  <div className="p-2 bg-white/5 rounded-lg text-white text-sm">
                    {new Date(selectedTask.completedAt).toLocaleString()}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TimeBoxApp;