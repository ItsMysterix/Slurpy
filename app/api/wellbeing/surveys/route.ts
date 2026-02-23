import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-auth';
import { createServerServiceClient } from '@/lib/supabase/server';
import { withCORS } from '@/lib/cors';
import { logger } from '@/lib/logger';
import { httpError } from '@/lib/validate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 10;

interface WellbeingSurveyRequest {
  phq2_q1?: number;
  phq2_q2?: number;
  gad2_q1?: number;
  gad2_q2?: number;
  post_session_mood_improvement?: number;
}

export const POST = withCORS(
  withAuth(async function POST(req: NextRequest, auth) {
    try {
      const body = (await req.json()) as WellbeingSurveyRequest;

      const sb = createServerServiceClient();

      // Atomic check: ensure preference record exists, then verify opt-out status
      // Use upsert to guarantee default record on first access (fixes race condition)
      const { data: prefData, error: prefError } = await sb
        .from('user_preferences')
        .upsert({ user_id: auth.userIdAsUuid }, { onConflict: 'user_id' })
        .select('survey_opt_out')
        .single();

      if (prefError) {
        logger.error('wellbeing.survey.preference_check_failed', {
          component: 'wellbeing_surveys',
          user_id: auth.userIdAsUuid,
          error_message: prefError.message,
        });
        return httpError(500, 'Preference initialization failed');
      }

      if (prefData?.survey_opt_out) {
        logger.info('wellbeing.survey.blocked_by_opt_out', {
          component: 'wellbeing_surveys',
          user_id: auth.userIdAsUuid,
        });
        return NextResponse.json(
          {
            ok: false,
            error: 'You have opted out of wellness surveys',
          },
          { status: 403 }
        );
      }

      // Validate scores (0-3 range for individual questions)
      const validateScore = (score: number | undefined, max: number) => {
        if (score === undefined || score === null) return null;
        const s = Math.floor(score);
        if (s < 0 || s > max) throw new Error(`Invalid score: ${score}`);
        return s;
      };

      const phq2_q1 = validateScore(body.phq2_q1, 3);
      const phq2_q2 = validateScore(body.phq2_q2, 3);
      const gad2_q1 = validateScore(body.gad2_q1, 3);
      const gad2_q2 = validateScore(body.gad2_q2, 3);
      const post_session = validateScore(body.post_session_mood_improvement, 5);

      // Calculate totals
      const phq2_total =
        phq2_q1 !== null && phq2_q2 !== null ? phq2_q1 + phq2_q2 : null;
      const gad2_total =
        gad2_q1 !== null && gad2_q2 !== null ? gad2_q1 + gad2_q2 : null;

      // Warn if scores suggest crisis (but don't block insertion)
      let warning: string | undefined;
      if (phq2_total !== null && phq2_total >= 4) {
        warning = 'PHQ-2 score suggests possible depression. Resources available.';
      }
      if (gad2_total !== null && gad2_total >= 4) {
        warning =
          (warning ? warning + ' ' : '') +
          'GAD-2 score suggests possible anxiety. Resources available.';
      }

      // Insert into wellbeing_surveys table
      const { data, error } = await sb
        .from('wellbeing_surveys')
        .insert({
          user_id: auth.userIdAsUuid,
          phq2_q1,
          phq2_q2,
          phq2_total,
          gad2_q1,
          gad2_q2,
          gad2_total,
          post_session_mood_improvement: post_session,
        })
        .select('id')
        .single();

      if (error) {
        logger.error('wellbeing.survey.insert_failed', {
          component: 'wellbeing_surveys',
          user_id: auth.userIdAsUuid,
          error_code: error.code,
          error_message: error.message,
        });
        return NextResponse.json(
          { ok: false, error: 'Failed to save survey' },
          { status: 500 }
        );
      }

      logger.info('wellbeing.survey.created', {
        component: 'wellbeing_surveys',
        user_id: auth.userIdAsUuid,
        phq2_total,
        gad2_total,
      });

      return NextResponse.json(
        {
          ok: true,
          id: data?.id,
          phq2_total: phq2_total ?? undefined,
          gad2_total: gad2_total ?? undefined,
          warning,
        },
        { status: 201 }
      );
    } catch (e) {
      logger.error('wellbeing.survey.error', {
        component: 'wellbeing_surveys',
        user_id: auth.userIdAsUuid,
        error_message: (e as Error).message,
      });
      return NextResponse.json(
        { ok: false, error: (e as Error).message },
        { status: 400 }
      );
    }
  })
);

export const GET = withCORS(
  withAuth(async function GET(req: NextRequest, auth) {
    try {
      const sb = createServerServiceClient();
      const { data, error } = await sb
        .from('wellbeing_surveys')
        .select('*')
        .eq('user_id', auth.userIdAsUuid)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) {
        logger.error('wellbeing.survey.fetch_failed', {
          component: 'wellbeing_surveys',
          user_id: auth.userIdAsUuid,
          error_message: error.message,
        });
        return NextResponse.json(
          { ok: false, error: 'Failed to fetch surveys' },
          { status: 500 }
        );
      }

      return NextResponse.json({ ok: true, surveys: data || [] }, { status: 200 });
    } catch (e) {
      console.error('Wellbeing survey GET error:', e);
      return NextResponse.json(
        { ok: false, error: (e as Error).message },
        { status: 400 }
      );
    }
  })
);
