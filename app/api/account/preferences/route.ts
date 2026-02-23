// app/api/account/preferences/route.ts
// Manage user preferences (survey opt-out, notifications, data sharing, etc.)

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-auth';
import { withCORS } from '@/lib/cors';
import { httpError } from '@/lib/validate';
import { createServerServiceClient } from '@/lib/supabase/server';
import { assertDoubleSubmit, assertSameOrigin } from '@/lib/csrf';
import { logger } from '@/lib/logger';

export const maxDuration = 10;

// GET /api/account/preferences
// Returns user's current preference settings
async function handleGET(request: NextRequest, auth: any) {
  try {
    const supabase = createServerServiceClient();

    // Fetch user preferences (create if doesn't exist)
    const { data, error } = await supabase
      .from('user_preferences')
      .select('survey_opt_out, notifications_enabled, anonymous_data_sharing, updated_at')
      .eq('user_id', auth.userIdAsUuid)
      .single();

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = no rows returned
      throw error;
    }

    // If no preferences record exists, return defaults
    if (!data) {
      return NextResponse.json({
        survey_opt_out: false,
        notifications_enabled: true,
        anonymous_data_sharing: false,
      });
    }

    return NextResponse.json(data);
  } catch (err) {
    logger.error('account.preferences.get_failed', {
      component: 'account_preferences',
      user_id: auth.userIdAsUuid,
      error_message: (err as Error).message,
    });
    return httpError(500, 'Failed to fetch preferences');
  }
}

// POST /api/account/preferences
// Update user preferences
async function handlePOST(request: NextRequest, auth: any) {
  // CSRF protection required for state-changing operation
  const sameOriginError = await assertSameOrigin(request);
  if (sameOriginError) return sameOriginError;
  const csrfError = assertDoubleSubmit(request);
  if (csrfError) return csrfError;

  try {
    const body = await request.json();
    const { survey_opt_out, notifications_enabled, anonymous_data_sharing } = body;

    // Validate input
    const updates: Record<string, any> = {};
    if (typeof survey_opt_out === 'boolean') updates.survey_opt_out = survey_opt_out;
    if (typeof notifications_enabled === 'boolean') updates.notifications_enabled = notifications_enabled;
    if (typeof anonymous_data_sharing === 'boolean') updates.anonymous_data_sharing = anonymous_data_sharing;

    if (Object.keys(updates).length === 0) {
      return httpError(400, 'No valid preference fields to update');
    }

    const supabase = createServerServiceClient();

    // Upsert user preferences
    const { data, error } = await supabase
      .from('user_preferences')
      .upsert({
        user_id: auth.userIdAsUuid,
        ...updates,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id',
      })
      .select()
      .single();

    if (error) throw error;

    logger.info('account.preferences.updated', {
      component: 'account_preferences',
      user_id: auth.userIdAsUuid,
      fields_updated: Object.keys(updates),
    });

    return NextResponse.json({
      success: true,
      preferences: data,
    });
  } catch (err) {
    logger.error('account.preferences.update_failed', {
      component: 'account_preferences',
      user_id: auth.userIdAsUuid,
      error_message: (err as Error).message,
    });
    return httpError(500, 'Failed to update preferences');
  }
}

export const GET = withCORS(withAuth(handleGET));
export const POST = withCORS(withAuth(handlePOST));
