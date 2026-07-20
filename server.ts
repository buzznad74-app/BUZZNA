import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;

  app.use(express.json());

  const requiredEnvVars = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY,
  };

  const optionalEnvVars = {
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    BREVO_API_KEY: process.env.BREVO_API_KEY,
    BREVO_SENDER_EMAIL: process.env.BREVO_SENDER_EMAIL,
    BREVO_SENDER_NAME: process.env.BREVO_SENDER_NAME,
    PAYSTACK_SECRET_KEY: process.env.PAYSTACK_SECRET_KEY,
  };

  console.log("[BuzzNa D74 Server] Environment Configuration Status:");
  Object.entries(requiredEnvVars).forEach(([key, value]) => {
    console.log(`  ✓ ${key}: ${value ? "✅" : "❌ MISSING"}`);
  });
  Object.entries(optionalEnvVars).forEach(([key, value]) => {
    console.log(`  ℹ ${key}: ${value ? "✅" : "⚠️"}`);
  });

  const supabaseUrl = process.env.SUPABASE_URL || "";
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_ANON_KEY || "";
  let supabase: any = null;

  function getSupabaseClient() {
    if (!supabase) {
      if (!supabaseUrl || !supabaseKey) {
        console.warn("[Supabase] Credentials not configured.");
        return null;
      }
      try {
        supabase = createClient(supabaseUrl, supabaseKey, {
          auth: { persistSession: false }
        });
        console.log("[Supabase] Client initialized.");
      } catch (e) {
        console.error("[Supabase] Failed to initialize:", e);
      }
    }
    return supabase;
  }

  // Helper: send email directly via Brevo from server context (synchronous server-side send)
  async function sendEmailDirect(to: string, subject: string, htmlContent: string) {
    const brevoApiKey = process.env.BREVO_API_KEY;
    const senderEmail = process.env.BREVO_SENDER_EMAIL || "no-reply@buzzna.com";
    const senderName = process.env.BREVO_SENDER_NAME || "BuzzNa D74";

    if (!brevoApiKey) {
      throw new Error('Email service not configured.');
    }

    const resp = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': brevoApiKey,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        sender: { name: senderName, email: senderEmail },
        to: [{ email: to }],
        subject,
        htmlContent
      })
    });

    const data = await resp.json();
    if (!resp.ok) {
      throw new Error(data.message || 'Brevo send failed');
    }
    return data;
  }

  // ========== ONBOARDING ==========
  app.post("/api/register-onboarding", async (req, res) => {
    try {
      const { business, settings, owner, password } = req.body;
      if (!business || !settings || !owner) {
        return res.status(400).json({ error: "Missing required payload." });
      }

      const client = getSupabaseClient();
      if (client) {
        const resBus = await client.from("buzzna_records").upsert({
          id: String(business.tenantId),
          table_name: "businesses",
          tenant_id: String(business.tenantId),
          data: business,
          updated_at: new Date().toISOString()
        }, { onConflict: 'id' });
        if (resBus.error) throw new Error(resBus.error.message);

        const resSet = await client.from("buzzna_records").upsert({
          id: String(settings.tenantId),
          table_name: "business_settings",
          tenant_id: String(settings.tenantId),
          data: settings,
          updated_at: new Date().toISOString()
        }, { onConflict: 'id' });
        if (resSet.error) throw new Error(resSet.error.message);

        const ownerWithPass = { ...owner, password };
        const resOwn = await client.from("buzzna_records").upsert({
          id: String(owner.userId),
          table_name: "users",
          tenant_id: String(owner.tenantId),
          data: ownerWithPass,
          updated_at: new Date().toISOString()
        }, { onConflict: 'id' });
        if (resOwn.error) throw new Error(resOwn.error.message);
      }

      // Compose a lightweight branded HTML welcome message (Light Theme, Blue placeholder branding)
      const welcomeHtml = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial; background:#ffffff; color:#111827; padding:24px;">
          <div style="max-width:680px;margin:0 auto;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
            <div style="background:#ffffff;padding:20px 24px;">
              <h1 style="margin:0;font-size:20px;color:#2563EB;">Welcome to BuzzNa D74</h1>
              <p style="margin:8px 0 0 0;font-size:14px;color:#374151;">Hello ${owner.username},</p>
              <p style="font-size:13px;color:#374151;line-height:1.4;">Your business <strong style="color:#111827;">${business.legalName}</strong> is now registered and ready. Get started by adding products, configuring tills, and inviting staff.</p>
              <div style="margin-top:12px;padding:12px;border-radius:8px;background:#f8fafc;border:1px solid #e6eefc;color:#0f172a;font-size:13px;">
                <strong>Tenant ID:</strong> ${String(business.tenantId)}
              </div>
              <p style="font-size:12px;color:#6b7280;margin-top:14px;">Need help? Reply to this email or visit the support center.</p>
              <p style="font-size:12px;color:#6b7280;margin-top:4px;">Thanks,<br/>The BuzzNa Team</p>
            </div>
          </div>
        </div>
      `;

      // Send email server-side using Brevo API key (preferred). If this fails it will be logged but onboarding returns success.
      if (process.env.BREVO_API_KEY && owner.emailAddress) {
        try {
          await sendEmailDirect(owner.emailAddress, `Welcome to BuzzNa D74 - ${business.legalName}!`, welcomeHtml);
          console.log(`[Onboarding] Welcome email sent to ${owner.emailAddress}`);
        } catch (emailErr) {
          console.warn('[Onboarding] Failed to send welcome email directly:', emailErr);
          // NOTE: we intentionally do not block successful onboarding if email fails
        }
      }

      res.json({ success: true, tenantId: business.tenantId });
    } catch (err: any) {
      console.error("[Onboarding] Error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // ========== EMAIL SYSTEM ==========
  // This endpoint remains for client-side queued sends / diagnostics; server-side direct sends are preferred.
  app.post("/api/emails/send", async (req, res) => {
    try {
      const { to, subject, htmlContent } = req.body;
      if (!to || !subject || !htmlContent) {
        return res.status(400).json({ error: "Missing email fields." });
      }

      const brevoApiKey = process.env.BREVO_API_KEY;
      if (!brevoApiKey) {
        return res.status(503).json({ error: "Email service not configured." });
      }

      const response = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "accept": "application/json",
          "api-key": brevoApiKey,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          sender: { name: process.env.BREVO_SENDER_NAME || "BuzzNa D74", email: process.env.BREVO_SENDER_EMAIL || "no-reply@buzzna.com" },
          to: [{ email: to }],
          subject,
          htmlContent
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.message);

      res.json({ success: true, messageId: data.messageId });
    } catch (err: any) {
      console.error("[Email] Error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // ========== PAYSTACK BILLING ==========
  app.post("/api/billing/paystack/initialize", async (req, res) => {
    try {
      const { email, amount, callbackUrl, tenantId } = req.body;
      if (!email || !amount) {
        return res.status(400).json({ error: "Email and amount required." });
      }

      const paystackSecret = process.env.PAYSTACK_SECRET_KEY;
      if (!paystackSecret) {
        const mockReference = `ref_mock_${Date.now()}`;
        return res.json({
          success: true,
          mock: true,
          authorization_url: `${callbackUrl || "http://localhost:3000"}/?payment=verify&reference=${mockReference}`,
          reference: mockReference
        });
      }

      const reference = `ref_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
      const paystackAmount = Math.round(Number(amount) * 100);

      const response = await fetch("https://api.paystack.co/transaction/initialize", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${paystackSecret}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email,
          amount: paystackAmount,
          currency: "KES",
          callback_url: callbackUrl,
          reference,
          metadata: { tenant_id: tenantId }
        })
      });

      const data: any = await response.json();
      if (!response.ok || !data.status) {
        throw new Error(data.message || "Paystack initialization failed.");
      }

      res.json({
        success: true,
        authorization_url: data.data.authorization_url,
        reference: data.data.reference
      });
    } catch (err: any) {
      console.error("[Paystack] Error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/billing/paystack/verify/:reference", async (req, res) => {
    try {
      const { reference } = req.params;
      if (!reference) {
        return res.status(400).json({ error: "Reference required." });
      }

      if (reference.startsWith("ref_mock_")) {
        return res.json({
          success: true,
          mock: true,
          reference,
          amount: 14999,
          currency: "KES",
          status: "success"
        });
      }

      const paystackSecret = process.env.PAYSTACK_SECRET_KEY;
      if (!paystackSecret) {
        return res.status(500).json({ error: "Paystack secret not configured." });
      }

      const response = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${paystackSecret}`,
          "Content-Type": "application/json"
        }
      });

      const data: any = await response.json();
      if (!response.ok || !data.status) {
        throw new Error(data.message || "Verification failed.");
      }

      if (data.data.status === "success") {
        res.json({
          success: true,
          reference,
          amount: data.data.amount / 100,
          currency: data.data.currency,
          status: data.data.status
        });
      } else {
        res.json({
          success: false,
          status: data.data.status,
          message: data.data.gateway_response || "Payment pending."
        });
      }
    } catch (err: any) {
      console.error("[Paystack] Error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // ========== AI FORECASTING ==========
  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: { headers: { 'User-Agent': 'buzzna-server' } }
  });

  app.post("/api/gemini/forecast", async (req, res) => {
    try {
      const { products, sales, industry } = req.body;
      if (!Array.isArray(products)) {
        return res.status(400).json({ error: "Products array required." });
      }

      if (!process.env.GEMINI_API_KEY) {
        return res.status(503).json({ error: "Gemini API not configured." });
      }

      const productsContext = products.map((p: any) => 
        `- ${p.productName}: Stock=${p.currentQuantity}, Price=KES ${p.retailPrice}, Cost=KES ${p.costFloor}`
      ).join("\n");

      const recentSalesContext = (sales && Array.isArray(sales)) 
        ? sales.slice(0, 15).map((s: any) => 
            `- Sale: KES ${s.grossTotal}, Method=${s.paymentMethod}, Time=${s.terminalTimestamp}`
          ).join("\n")
        : "No sales recorded.";

      const prompt = `You are a business analyst for ${industry || 'Retail'} in Kenya. Analyze this inventory and sales data to provide 3-5 actionable insights on stock replenishment, pricing optimization, and sales trends.\n\nInventory:\n${productsContext}\n\nRecent Sales:\n${recentSalesContext}\n\nProvide concise, scannable advice.`;

      const response = await ai.models.generateContent({
        model: "gemini-1.5-flash",
        contents: prompt,
      });

      res.json({ forecast: response.text });
    } catch (err: any) {
      console.error("[Gemini] Error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // ========== SYNC QUEUE PROCESSOR ==========
  app.post("/api/sync/process", async (req, res) => {
    try {
      const item = req.body;
      console.log(`Processing sync item: ${item.queueId}`);
      // Server can decide to persist or forward items to permanent store here.
      res.json({ success: true, processed: item.queueId });
    } catch (err: any) {
      console.error("[Sync] Error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // ========== STAFF MANAGEMENT ==========
  // NOTE: For production, add auth middleware and RBAC checks (Owner only) before creating staff.
  app.post("/api/staff/create", async (req, res) => {
    try {
      const { username, phoneNumber, role, tenantId, email } = req.body;
      if (!username || !phoneNumber || !role || !tenantId) {
        return res.status(400).json({ error: "Missing required fields." });
      }

      const client = getSupabaseClient();
      if (!client) return res.status(500).json({ error: "Database unavailable." });

      const userId = 'user-' + Date.now() + Math.random().toString(36).substr(2, 9);
      const { error } = await client.from('users').insert([{
        user_id: userId,
        tenant_id: tenantId,
        username,
        phone_number: phoneNumber,
        role,
        is_active: true,
        created_at: new Date().toISOString()
      }]);

      if (error) throw new Error(error.message);

      // Optional automatic invite email for new staff (server-side)
      if (process.env.BREVO_API_KEY && email) {
        const inviteHtml = `
          <div style="font-family: system-ui, -apple-system, Segoe UI, Roboto; padding:16px; background:#fff; color:#111827;">
            <h2 style="color:#2563EB;margin:0 0 8px 0;">You were invited to BuzzNa</h2>
            <p style="margin:0;font-size:13px;color:#374151;">Hello ${username}, you were added as <strong>${role}</strong>. Log in to the terminal with the assigned PIN.</p>
          </div>
        `;
        try {
          await sendEmailDirect(email, `You've been invited to ${tenantId} on BuzzNa`, inviteHtml);
        } catch (mailErr) {
          console.warn('[Staff] Invite email failed:', mailErr);
        }
      }

      res.json({ success: true, userId });
    } catch (err: any) {
      console.error("[Staff] Error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/staff/:tenantId", async (req, res) => {
    try {
      const { tenantId } = req.params;
      const client = getSupabaseClient();
      if (!client) return res.status(500).json({ error: "Database unavailable." });

      const { data, error } = await client.from('users').select('*').eq('tenant_id', tenantId);
      if (error) throw new Error(error.message);

      res.json({ success: true, staff: data });
    } catch (err: any) {
      console.error("[Staff] Error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // ========== LOGS ==========
  app.post("/api/logs/transaction", async (req, res) => {
    try {
      const log = req.body;
      console.log(`[Transaction Log] ${log.transactionId}: ${log.action}`);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Logging failed." });
    }
  });

  // ========== VITE ==========
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`\n🚀 [BuzzNa D74] Running on http://0.0.0.0:${PORT}`);
    console.log(`📊 NODE_ENV: ${process.env.NODE_ENV || "development"}`);
  });
}

startServer();
