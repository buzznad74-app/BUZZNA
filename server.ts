import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { emailQueue } from "./src/lib/email-queue";

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

      const brevoApiKey = process.env.BREVO_API_KEY;
      const senderEmail = process.env.BREVO_SENDER_EMAIL || "no-reply@buzzna.com";
      const senderName = process.env.BREVO_SENDER_NAME || "BuzzNa D74";

      if (brevoApiKey && owner.emailAddress) {
        await emailQueue.enqueue({
          to: owner.emailAddress,
          subject: `Welcome to BuzzNa D74 - ${business.legalName}!`,
          htmlContent: `<div style="font-family: sans-serif; padding: 24px; color: #1c1917; max-width: 600px; margin: 0 auto;"><h1 style="color: #4f46e5;">Welcome ${owner.username}!</h1><p>Your business has been registered. Start by adding products and opening a till session.</p></div>`
        });
      }

      res.json({ success: true, tenantId: business.tenantId });
    } catch (err: any) {
      console.error("[Onboarding] Error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // ========== EMAIL SYSTEM ==========
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
          sender: { name: "BuzzNa D74", email: "no-reply@buzzna.com" },
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
      res.json({ success: true, processed: item.queueId });
    } catch (err: any) {
      console.error("[Sync] Error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // ========== STAFF MANAGEMENT ==========
  app.post("/api/staff/create", async (req, res) => {
    try {
      const { username, phoneNumber, role, tenantId } = req.body;
      if (!username || !phoneNumber || !role) {
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
