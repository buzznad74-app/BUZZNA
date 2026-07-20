/**
 * BuzzNa D74 - Error Logging Routes
 * Captures and stores application errors for debugging and monitoring
 */

import { Router, Request, Response } from 'express';
import { supabase } from '../lib/supabase';

const router = Router();

interface ErrorLogPayload { 
  timestamp: string;
  message: string;
  stack?: string;
  componentStack?: string;
  userId?: string;
  tenantId?: string;
  userAgent?: string;
  url?: string;
}

/**
 * POST /api/logs/error
 * Log frontend application errors to backend for monitoring
 */
router.post('/error', async (req: Request, res: Response) => {
  try {
    const {
      timestamp,
      message,
      stack,
      componentStack,
      userId,
      tenantId,
      userAgent,
      url
    }: ErrorLogPayload = req.body;

    if (!message || !timestamp) {
      return res.status(400).json({ error: 'Missing required fields: message, timestamp' });
    }

    // Store error log in Supabase
    const { data, error: dbError } = await supabase
      .from('error_logs')
      .insert([{
        timestamp,
        message,
        stack,
        component_stack: componentStack,
        user_id: userId,
        tenant_id: tenantId,
        user_agent: userAgent,
        url,
        severity: 'error',
        resolved: false,
        created_at: new Date().toISOString()
      }]);

    if (dbError) {
      console.error('[Logs] Database error:', dbError);
      return res.status(500).json({ error: 'Failed to store error log' });
    }

    console.error(`[Error Log] ${message} - Stack: ${stack}`);
    
    // Optionally send alert if critical error
    if (message.includes('CRITICAL') || message.includes('FATAL')) {
      console.warn(`[Alert] Critical error detected: ${message}`);
      // Could trigger email alert or SMS here
    }

    return res.status(200).json({ success: true, message: 'Error logged successfully' });
  } catch (err: any) {
    console.error('[Logs] Error logging failed:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

/**
 * GET /api/logs/error
 * Retrieve error logs (admin only)
 */
router.get('/error', async (req: Request, res: Response) => {
  try {
    const { limit = 100, offset = 0, tenantId } = req.query;

    let query = supabase
      .from('error_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .range(Number(offset), Number(offset) + Number(limit) - 1);

    if (tenantId) {
      query = query.eq('tenant_id', tenantId);
    }

    const { data, error: dbError, count } = await query;

    if (dbError) {
      console.error('[Logs] Retrieval error:', dbError);
      return res.status(500).json({ error: 'Failed to retrieve error logs' });
    }

    return res.status(200).json({ logs: data, total: count });
  } catch (err: any) {
    console.error('[Logs] Retrieval failed:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

/**
 * POST /api/logs/activity
 * Log general activity events (logins, exports, etc.)
 */
router.post('/activity', async (req: Request, res: Response) => {
  try {
    const { userId, tenantId, action, description, metadata } = req.body;

    if (!userId || !action) {
      return res.status(400).json({ error: 'Missing required fields: userId, action' });
    }

    const { error: dbError } = await supabase
      .from('activity_logs')
      .insert([{
        user_id: userId,
        tenant_id: tenantId,
        action,
        description,
        metadata,
        created_at: new Date().toISOString()
      }]);

    if (dbError) {
      console.error('[Activity Log] Database error:', dbError);
      return res.status(500).json({ error: 'Failed to log activity' });
    }

    return res.status(200).json({ success: true, message: 'Activity logged' });
  } catch (err: any) {
    console.error('[Activity Log] Failed:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

export default router;
