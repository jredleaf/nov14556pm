import React, { useState, useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import TaskLine from './components/TaskLine';
import CompletedTasks from './components/CompletedTasks';
import Toggle from './components/Toggle';
import NameInput from './components/NameInput';
import AuthCallback from './pages/AuthCallback';
import { Task, CompletedTask } from './types';
import useConfetti from './hooks/useConfetti';
import useZoom from './hooks/useZoom';
import { useUser } from './hooks/useUser';
import { createClient } from './utils/supabase/client';

const App: React.FC = () => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [completedTasks, setCompletedTasks] = useState<CompletedTask[]>([]);
  const triggerConfetti = useConfetti();
  const { isConfigured, error: zoomError } = useZoom({
    capabilities: ['shareApp', 'authorize', 'promptAuthorize']
  });
  const { user, loading, showNameInput, saveName, setShowNameInput } = useUser();
  const supabase = createClient();

  useEffect(() => {
    if (user) {
      fetchTasks();
      fetchCompletedTasks();
      setupRealtimeSubscriptions();
    }

    return () => {
      supabase.removeAllChannels();
    };
  }, [user]);

  const setupRealtimeSubscriptions = () => {
    if (!user?.account_id) return;

    const tasksChannel = supabase
      .channel('tasks-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'Tasks',
          filter: `account_id=eq.${user.account_id}`
        },
        async (payload) => {
          if (payload.eventType === 'INSERT' && !payload.new.completed) {
            setTasks(current => [...current, payload.new as Task]);
          }
          else if (payload.eventType === 'DELETE') {
            setTasks(current => current.filter(task => task.id !== payload.old.id));
          }
          else if (payload.eventType === 'UPDATE') {
            const updatedTask = payload.new as Task;
            
            // If task was completed
            if (updatedTask.completed && !payload.old.completed) {
              setTasks(current => current.filter(task => task.id !== updatedTask.id));
              const completedTask: CompletedTask = {
                id: updatedTask.id,
                task: updatedTask.task,
                completedAt: updatedTask.completed_at || new Date().toISOString(),
                completedBy: updatedTask.user_name || 'Anonymous',
                reactions: {
                  hearts: updatedTask.number_of_likes || 0,
                  celebrations: updatedTask.number_of_celebrations || 0
                }
              };
              setCompletedTasks(current => [completedTask, ...current].slice(0, 50));
              triggerConfetti();
            }
            // If reaction was updated
            else if (updatedTask.completed) {
              setCompletedTasks(current =>
                current.map(task =>
                  task.id === updatedTask.id
                    ? {
                        ...task,
                        reactions: {
                          hearts: updatedTask.number_of_likes || 0,
                          celebrations: updatedTask.number_of_celebrations || 0
                        }
                      }
                    : task
                )
              );
            }
            // Regular task update
            else {
              setTasks(current =>
                current.map(task =>
                  task.id === updatedTask.id ? updatedTask : task
                )
              );
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(tasksChannel);
    };
  };

  const fetchTasks = async () => {
    try {
      const { data, error } = await supabase
        .from('Tasks')
        .select('*')
        .eq('completed', false)
        .eq('account_id', user?.account_id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTasks(data || []);
    } catch (error) {
      console.error('Error fetching tasks:', error);
    }
  };

  const fetchCompletedTasks = async () => {
    try {
      // Get tasks completed in the last 3 hours
      const threeHoursAgo = new Date();
      threeHoursAgo.setHours(threeHoursAgo.getHours() - 3);

      const { data, error } = await supabase
        .from('Tasks')
        .select('*')
        .eq('completed', true)
        .eq('account_id', user?.account_id)
        .gte('completed_at', threeHoursAgo.toISOString())
        .order('completed_at', { ascending: false });

      if (error) throw error;

      const formattedTasks: CompletedTask[] = (data || []).map(task => ({
        id: task.id,
        task: task.task,
        completedAt: task.completed_at || new Date().toISOString(),
        completedBy: task.user_name || 'Anonymous',
        reactions: {
          hearts: task.number_of_likes || 0,
          celebrations: task.number_of_celebrations || 0
        }
      }));

      setCompletedTasks(formattedTasks);
    } catch (error) {
      console.error('Error fetching completed tasks:', error);
    }
  };

  const handleAddTask = async (taskContent: string) => {
    if (!user) return;
    
    if (taskContent.trim() && tasks.length < 3) {
      const newTask = {
        task: taskContent.trim(),
        user_name: user.name,
        created_at: new Date().toISOString(),
        completed: false,
        number_of_likes: 0,
        number_of_celebrations: 0,
        timer_used: false,
        timer_length_used: null,
        account_id: user.account_id,
        meeting_id: user.meeting_id
      };

      try {
        const { error } = await supabase
          .from('Tasks')
          .insert([newTask]);

        if (error) throw error;
      } catch (error) {
        console.error('Error adding task:', error);
      }
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    try {
      const { error } = await supabase
        .from('Tasks')
        .delete()
        .eq('id', taskId)
        .eq('account_id', user?.account_id);

      if (error) throw error;
    } catch (error) {
      console.error('Error deleting task:', error);
    }
  };

  const handleDragEnd = (result: any) => {
    if (!result.destination) return;
    const items = Array.from(tasks);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);
    setTasks(items);
  };

  const completeTask = async (taskId: string) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('Tasks')
        .update({ 
          completed: true,
          completed_at: new Date().toISOString(),
          user_name: user.name
        })
        .eq('id', taskId)
        .eq('account_id', user.account_id);

      if (error) throw error;
    } catch (error) {
      console.error('Error completing task:', error);
    }
  };

  const addReaction = async (taskId: string, type: 'hearts' | 'celebrations') => {
    try {
      const { error } = await supabase
        .from('Tasks')
        .update({
          [type === 'hearts' ? 'number_of_likes' : 'number_of_celebrations']: type === 'hearts' ? 
            completedTasks.find(t => t.id === taskId)?.reactions?.hearts + 1 : 
            completedTasks.find(t => t.id === taskId)?.reactions?.celebrations + 1
        })
        .eq('id', taskId)
        .eq('account_id', user?.account_id);

      if (error) throw error;
    } catch (error) {
      console.error('Error adding reaction:', error);
    }
  };

  // Create taskSlots array
  const taskSlots = Array(3).fill(null).map((_, index) => tasks[index] || null);

  if (zoomError) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#fff8eb] to-[#fff1d6] p-4 sm:p-6 flex items-center justify-center">
        <div className="bg-white rounded-xl shadow-xl p-4 sm:p-6 max-w-md w-full">
          <h1 className="text-xl sm:text-2xl font-bold text-red-600 mb-4">Connection Error</h1>
          <p className="text-gray-700">{zoomError}</p>
        </div>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/" element={
        <div className="min-h-screen bg-gradient-to-br from-[#fff8eb] to-[#fff1d6] p-4 sm:p-6">
          <div className="max-w-3xl mx-auto space-y-4 sm:space-y-6">
            <header className="text-center mb-6 sm:mb-8">
              <div className="flex items-center justify-center mb-3 sm:mb-4">
                <img 
                  src="/images/logo.png" 
                  alt="Caveday Logo" 
                  className="h-8 sm:h-12"
                />
              </div>
              <h1 className="text-2xl sm:text-4xl font-bold text-gray-900 mb-2 font-poppins">
                {user?.name ? `${user.name}'s Task List` : 'Task List'}
              </h1>
            </header>

            <div className="bg-white rounded-xl shadow-xl p-4 sm:p-6 mb-4 sm:mb-6">
              <Toggle />
              <DragDropContext onDragEnd={handleDragEnd}>
                <Droppable droppableId="tasks">
                  {(provided) => (
                    <div
                      {...provided.droppableProps}
                      ref={provided.innerRef}
                      className="space-y-2 sm:space-y-3"
                    >
                      {taskSlots.map((task, index) => (
                        <Draggable 
                          key={task?.id || `empty-${index}`} 
                          draggableId={task?.id || `empty-${index}`} 
                          index={index}
                          isDragDisabled={!task}
                        >
                          {(provided) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              {...provided.dragHandleProps}
                            >
                              <TaskLine
                                task={task}
                                onComplete={completeTask}
                                onTaskAdd={handleAddTask}
                                onDelete={handleDeleteTask}
                                placeholder={`Task ${index + 1}`}
                                onNameNeeded={() => setShowNameInput(true)}
                                isUserLoggedIn={!!user}
                              />
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </DragDropContext>
            </div>

            <div className="bg-white rounded-xl shadow-xl p-4 sm:p-6">
              <div className="elfsight-app-37648299-4f05-48ce-9b7b-9c15c4600ef3" data-elfsight-app-lazy></div>
            </div>

            <CompletedTasks 
              completedTasks={completedTasks}
              addReaction={addReaction}
            />
          </div>

          {showNameInput && (
            <NameInput 
              onSubmit={saveName}
              onClose={() => setShowNameInput(false)}
              isOverlay={true}
            />
          )}
        </div>
      } />
    </Routes>
  );
};

export default App;