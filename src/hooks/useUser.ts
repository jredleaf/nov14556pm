import { useState, useEffect } from 'react';
import { createClient } from '../utils/supabase/client';
import type { User } from '../types';

export function useUser() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [showNameInput, setShowNameInput] = useState(false);
  const supabase = createClient();

  const getUrlParams = () => {
    const searchParams = new URLSearchParams(window.location.search);
    const accountId = searchParams.get('accountId');
    const meetingId = searchParams.get('meetingId');

    return {
      accountId: accountId || `preview-${Date.now()}`,
      meetingId: meetingId || `preview-${Date.now()}`
    };
  };

  useEffect(() => {
    let mounted = true;

    const fetchUser = async () => {
      try {
        const params = getUrlParams();
        
        const { data: existingUser, error: fetchError } = await supabase
          .from('Users')
          .select('*')
          .eq('account_id', params.accountId)
          .single();

        if (!mounted) return;

        if (fetchError) {
          if (fetchError.code !== 'PGRST116') {
            console.warn('Error fetching user:', fetchError);
          }
          setShowNameInput(true);
        } else if (existingUser) {
          if (params.meetingId && existingUser.meeting_id !== params.meetingId) {
            const { data: updatedUser, error: updateError } = await supabase
              .from('Users')
              .update({ meeting_id: params.meetingId })
              .eq('id', existingUser.id)
              .select()
              .single();

            if (updateError) {
              console.warn('Error updating meeting ID:', updateError);
              setUser(existingUser);
            } else if (updatedUser) {
              setUser(updatedUser);
            }
          } else {
            setUser(existingUser);
          }
        } else {
          setShowNameInput(true);
        }
      } catch (error) {
        console.warn('Error in fetchUser:', error);
        setShowNameInput(true);
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    fetchUser();

    return () => {
      mounted = false;
    };
  }, []);

  const saveName = async (name: string): Promise<void> => {
    if (!name.trim()) {
      throw new Error('Name is required');
    }

    const params = getUrlParams();

    try {
      const { data, error } = await supabase
        .from('Users')
        .insert({
          account_id: params.accountId,
          meeting_id: params.meetingId,
          name: name.trim()
        })
        .select()
        .single();

      if (error) {
        console.error('Error saving user:', error);
        throw new Error(error.message || 'Failed to save user');
      }

      if (!data) {
        throw new Error('No user data returned');
      }

      setUser(data);
      setShowNameInput(false);
    } catch (error) {
      console.error('Error in saveName:', error);
      throw error instanceof Error ? error : new Error('Failed to save user');
    }
  };

  return {
    user,
    loading,
    showNameInput,
    setShowNameInput,
    saveName
  };
}