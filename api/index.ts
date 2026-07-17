import express from "express";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenAI } from "@google/genai";

const app = express();
app.use(express.json());

// Initialize Supabase Client
const supabaseUrl = process.env.SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || "";

let supabase: any = null;

function getSupabaseClient() {
  if (!supabase) {
    if (!supabaseUrl || !supabaseKey) {
      console.warn("Supabase credentials not configured in environment variables. Database proxy endpoints will operate locally.");
      return null;
    }
    try {
      supabase = createClient(supabaseUrl, supabaseKey, {
        auth: {
          persistSession: false
        }
      });
    } catch (e) {
      console.error("Failed to initialize Supabase client:", e);
    }
  }
  return supabase;
}

// Supabase proxy endpoints
app.post("/db/:table/upsert", async (req, res) => {
  try {
    const { table } = req.params;
    const { item } = req.body;

    if (!item) {
      return res.status(400).json({ error: "Missing required item payload." });
    }

    const client = getSupabaseClient();
    if (!client) {
      return res.json({ success: true, localOnly: true });
    }

    const id = String(item.tenantId || item.productId || item.categoryId || item.userId || item.customerId || item.transactionId || item.itemId || item.expenseId || item.sessionId || item.ledgerId || item.id || Date.now());
    const tenantId = item.tenantId || null;

    const { error } = await client
      .from("buzzna_records")
      .upsert({
        id,
        table_name: table,
        tenant_id: tenantId ? String(tenantId) : null,
        data: item,
        updated_at: new Date().toISOString()
      }, { onConflict: 'id' });

    if (error) {
      console.error(`Supabase Upsert Error for ${table}:`, error);
      return res.status(500).json({ error: error.message });
    }

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/db/:table", async (req, res) => {
  try {
    const { table } = req.params;

    const client = getSupabaseClient();
    if (!client) {
      return res.json([]);
    }

    const { data, error } = await client
      .from("buzzna_records")
      .select("data")
      .eq("table_name", table);

    if (error) {
      console.error(`Supabase Get Error for ${table}:`, error);
      return res.status(500).json({ error: error.message });
    }

    const items = (data || []).map((row: any) => row.data);
    res.json(items);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/db/:table/:id", async (req, res) => {
  try {
    const { table, id } = req.params;

    const client = getSupabaseClient();
    if (!client) {
      return res.json({ success: true, localOnly: true });
    }

    const { error } = await client
      .from("buzzna_records")
      .delete()
      .eq("id", id)
      .eq("table_name", table);

    if (error) {
      console.error(`Supabase Delete Error for ${table}:`, error);
      return res.status(500).json({ error: error.message });
    }

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/db/:table/clear", async (req, res) => {
  try {
    const { table } = req.params;

    const client = getSupabaseClient();
    if (!client) {
      return res.json({ success: true, localOnly: true });
    }

    const { error } = await client
      .from("buzzna_records")
      .delete()
      .eq("table_name", table);

    if (error) {
      console.error(`Supabase Clear Error for ${table}:`, error);
      return res.status(500).json({ error: error.message });
    }

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Business Onboarding
app.post("/register-onboarding", async (req, res) => {
  try {
    const { business, settings, owner, password } = req.body;

    if (!business || !settings || !owner) {
      return res.status(400).json({ error: "Missing required onboarding payload." });
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
      if (resBus.error) throw new Error(`Business save failed: ${resBus.error.message}`);

      const resSet = await client.from("buzzna_records").upsert({
        id: String(settings.tenantId),
        table_name: "business_settings",
        tenant_id: String(settings.tenantId),
        data: settings,
        updated_at: new Date().toISOString()
      }, { onConflict: 'id' });
      if (resSet.error) throw new Error(`Settings save failed: ${resSet.error.message}`);

      const ownerWithPass = { ...owner, password };
      const resOwn = await client.from("buzzna_records").upsert({
        id: String(owner.userId),
        table_name: "users",
        tenant_id: String(owner.tenantId),
        data: ownerWithPass,
        updated_at: new Date().toISOString()
      }, { onConflict: 'id' });
      if (resOwn.error) throw new Error(`Owner save failed: ${resOwn.error.message}`);
    }

    // Send Welcome & Confirmation Emails via Brevo API
    const brevoApiKey = process.env.BREVO_API_KEY;
    const senderEmail = process.env.BREVO_SENDER_EMAIL || "no-reply@buzzna.com";
    const senderName = process.env.BREVO_SENDER_NAME || "BuzzNa D74 Cloud OS";

    if (brevoApiKey && owner.emailAddress) {
      try {
        const welcomeSubject = `Welcome to BuzzNa D74 - ${business.legalName}!`;
        const welcomeHtml = `
          <div style="font-family: sans-serif; padding: 24px; color: #1c1917; max-width: 600px; margin: 0 auto; border: 1px solid #e4e4e7; border-radius: 16px; background-color: #ffffff;">
            <div style="text-align: center; margin-bottom: 24px;">
              <h1 style="color: #4f46e5; margin: 0; font-size: 26px; text-transform: uppercase; font-weight: 800; letter-spacing: -0.05em;">BuzzNa D74</h1>
              <p style="font-size: 11px; color: #71717a; margin-top: 4px; text-transform: uppercase; font-weight: 700; letter-spacing: 0.05em;">Enterprise Operational OS</p>
            </div>
            <hr style="border: 0; border-top: 1px solid #f4f4f5; margin-bottom: 24px;" />
            <p style="font-size: 15px; line-height: 1.5;">Dear <strong>${owner.username}</strong>,</p>
            <p style="font-size: 14px; line-height: 1.5; color: #3f3f46;">Welcome to <strong>BuzzNa D74 Cloud OS</strong>! We are absolutely thrilled to partner with you to power and streamline your business operations.</p>
            <p style="font-size: 14px; line-height: 1.5; color: #3f3f46;">Your 14-day premium enterprise trial has been successfully provisioned. You now have full administrative access to our unified retail ERP and offline-first POS terminal.</p>
            
            <div style="background-color: #f5f3ff; border: 1px solid #ddd6fe; border-radius: 12px; padding: 18px; margin: 24px 0;">
              <h3 style="color: #5b21b6; margin: 0 0 8px 0; font-size: 13px; text-transform: uppercase; font-weight: 700;">Next Steps to Launch:</h3>
              <ul style="margin: 0; padding-left: 20px; font-size: 13px; color: #4c1d95; line-height: 1.6;">
                <li>Login to your principal admin panel using your credentials.</li>
                <li>Go to <b>Inventory</b> and register your baseline product catalog.</li>
                <li>Open a new <b>Till Session</b> under the Till Shift tab.</li>
                <li>Begin checking out transactions in real-time.</li>
              </ul>
            </div>

            <p style="font-size: 13px; line-height: 1.5; color: #71717a;">If you have any questions, our dedicated merchant success desk is available 24/7 on WhatsApp at <b>+254790435584</b>.</p>
            <p style="margin-top: 32px; font-size: 13px; color: #71717a; border-top: 1px solid #f4f4f5; padding-top: 16px;">Warm regards,<br/>The BuzzNa Onboarding Team</p>
          </div>
        `;

        await fetch("https://api.brevo.com/v3/smtp/email", {
          method: "POST",
          headers: {
            "accept": "application/json",
            "api-key": brevoApiKey,
            "content-type": "application/json"
          },
          body: JSON.stringify({
            sender: { name: senderName, email: senderEmail },
            to: [{ email: owner.emailAddress, name: owner.username }],
            subject: welcomeSubject,
            htmlContent: welcomeHtml
          })
        });

        const confirmSubject = `CONFIRMED: Business Registration Details for ${business.tradeName}`;
        const confirmHtml = `
          <div style="font-family: sans-serif; padding: 24px; color: #1c1917; max-width: 600px; margin: 0 auto; border: 1px solid #e4e4e7; border-radius: 16px; background-color: #ffffff;">
            <div style="text-align: center; margin-bottom: 24px;">
              <h1 style="color: #059669; margin: 0; font-size: 26px; text-transform: uppercase; font-weight: 800; letter-spacing: -0.05em;">BuzzNa D74</h1>
              <p style="font-size: 11px; color: #71717a; margin-top: 4px; text-transform: uppercase; font-weight: 700; letter-spacing: 0.05em;">Registration Confirmation</p>
            </div>
            <hr style="border: 0; border-top: 1px solid #f4f4f5; margin-bottom: 24px;" />
            <p style="font-size: 15px; line-height: 1.5;">Hello <strong>${owner.username}</strong>,</p>
            <p style="font-size: 14px; line-height: 1.5; color: #3f3f46;">This email confirms that your business entity registration on BuzzNa D74 is fully processed and secured in our cloud storage.</p>
            
            <table style="width: 100%; border-collapse: collapse; margin: 24px 0; font-size: 13px;">
              <thead>
                <tr style="background-color: #f4f4f5; text-align: left;">
                  <th style="padding: 10px; border-bottom: 1px solid #e4e4e7; text-transform: uppercase; color: #71717a; font-weight: 700;">Setting Parameter</th>
                  <th style="padding: 10px; border-bottom: 1px solid #e4e4e7; text-transform: uppercase; color: #71717a; font-weight: 700;">Registered Value</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style="padding: 10px; border-bottom: 1px solid #f4f4f5; font-weight: 600;">Legal Entity</td>
                  <td style="padding: 10px; border-bottom: 1px solid #f4f4f5;">${business.legalName}</td>
                </tr>
                <tr>
                  <td style="padding: 10px; border-bottom: 1px solid #f4f4f5; font-weight: 600;">Trade Name</td>
                  <td style="padding: 10px; border-bottom: 1px solid #f4f4f5;">${business.tradeName}</td>
                </tr>
                <tr>
                  <td style="padding: 10px; border-bottom: 1px solid #f4f4f5; font-weight: 600;">Sector Vertical</td>
                  <td style="padding: 10px; border-bottom: 1px solid #f4f4f5;">${business.industry}</td>
                </tr>
                <tr>
                  <td style="padding: 10px; border-bottom: 1px solid #f4f4f5; font-weight: 600;">Country / Currency</td>
                  <td style="padding: 10px; border-bottom: 1px solid #f4f4f5;">${business.country} (${business.currency})</td>
                </tr>
                <tr>
                  <td style="padding: 10px; border-bottom: 1px solid #f4f4f5; font-weight: 600;">Admin Username</td>
                  <td style="padding: 10px; border-bottom: 1px solid #f4f4f5; font-family: monospace; color: #4f46e5; font-weight: 700;">${owner.username}</td>
                </tr>
                <tr>
                  <td style="padding: 10px; border-bottom: 1px solid #f4f4f5; font-weight: 600;">Admin Phone</td>
                  <td style="padding: 10px; border-bottom: 1px solid #f4f4f5;">${owner.phoneNumber}</td>
                </tr>
              </tbody>
            </table>

            <p style="font-size: 12px; color: #ef4444; background-color: #fef2f2; border: 1px solid #fca5a5; padding: 12px; border-radius: 8px; line-height: 1.4; margin-top: 20px;">
              <b>Security Reminder:</b> Keep your password and passcode credentials strictly confidential. Never share your admin login credentials with unauthorized staff or third parties.
            </p>

            <p style="margin-top: 32px; font-size: 11px; color: #a1a1aa; text-align: center; border-top: 1px solid #f4f4f5; padding-top: 16px;">
              This is a system generated notification confirming your onboarding details.
            </p>
          </div>
        `;

        await fetch("https://api.brevo.com/v3/smtp/email", {
          method: "POST",
          headers: {
            "accept": "application/json",
            "api-key": brevoApiKey,
            "content-type": "application/json"
          },
          body: JSON.stringify({
            sender: { name: senderName, email: senderEmail },
            to: [{ email: owner.emailAddress, name: owner.username }],
            subject: confirmSubject,
            htmlContent: confirmHtml
          })
        });

        console.log(`Onboarding welcome & confirmation emails successfully dispatched to ${owner.emailAddress}`);
      } catch (emailErr) {
        console.error("Brevo Onboarding Email Dispatch Error:", emailErr);
      }
    } else {
      console.warn("Brevo API integration skipped: BREVO_API_KEY or owner email address missing.");
    }

    res.json({ success: true, tenantId: business.tenantId });
  } catch (err: any) {
    console.error("Critical Onboarding Endpoint Failure:", err);
    res.status(500).json({ error: err.message || "Onboarding failed" });
  }
});

// Paystack Billing Endpoints
app.post("/billing/paystack/initialize", async (req, res) => {
  try {
    const { email, amount, callbackUrl, tenantId } = req.body;

    if (!email || !amount) {
      return res.status(400).json({ error: "Email and amount are required to initialize Paystack transaction." });
    }

    const paystackSecret = process.env.PAYSTACK_SECRET_KEY;
    if (!paystackSecret) {
      console.warn("PAYSTACK_SECRET_KEY is missing. Providing a high-contrast mock transaction link.");
      const mockReference = `ref_mock_${Date.now()}`;
      return res.json({
        success: true,
        mock: true,
        authorization_url: `${callbackUrl || "https://buzznad74.vercel.app"}/?payment=verify&reference=${mockReference}&mock=true`,
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
        metadata: {
          custom_fields: [
            {
              display_name: "Tenant ID",
              variable_name: "tenant_id",
              value: tenantId
            }
          ]
        }
      })
    });

    const data: any = await response.json();
    if (!response.ok || !data.status) {
      throw new Error(data.message || "Failed to contact Paystack billing server.");
    }

    res.json({
      success: true,
      authorization_url: data.data.authorization_url,
      reference: data.data.reference
    });
  } catch (err: any) {
    console.error("Paystack Initialize Error:", err);
    res.status(500).json({ error: err.message || "On-demand subscription billing handshaking failed." });
  }
});

app.get("/billing/paystack/verify/:reference", async (req, res) => {
  try {
    const { reference } = req.params;

    if (!reference) {
      return res.status(400).json({ error: "Reference parameter is required." });
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
      return res.status(500).json({ error: "Paystack secret credentials are not configured on Cloud OS." });
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
      throw new Error(data.message || "Failed to verify transaction signature with Paystack.");
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
        message: data.data.gateway_response || "Payment pending or declined."
      });
    }
  } catch (err: any) {
    console.error("Paystack Verification Error:", err);
    res.status(500).json({ error: err.message || "Could not complete licensing transaction verification." });
  }
});

// Server-side Gemini API initialization
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

app.post("/gemini/forecast", async (req, res) => {
  try {
    const { products, sales, industry } = req.body;

    if (!products || !Array.isArray(products)) {
      res.status(400).json({ error: "Products array is required." });
      return;
    }

    const productsContext = products.map((p: any) => 
      `- ${p.productName}: Stock=${p.currentQuantity} units, Retail Price=KES ${p.retailPrice}, Cost=KES ${p.costFloor} (Exp Date=${p.expiryDate || 'N/A'})`
    ).join("\n");

    const recentSalesContext = (sales && Array.isArray(sales)) 
      ? sales.slice(0, 15).map((s: any) => 
          `- Gross Sale=KES ${s.grossTotal}, Pay Mode=${s.paymentMethod}, Time=${s.terminalTimestamp}`
        ).join("\n")
      : "No recent sales recorded yet.";

    const prompt = `
      You are an Elite Business Analyst specializing in East African SME operational optimization for the industry sector vertical: "${industry || 'Retail General'}".
      Analyze the stock inventory and recent transaction data to provide high-leverage suggestions:
      1. Stock replenishment warnings (identify depleted, under-stocked, or expired items).
      2. Visual profit-margin optimizations (identify low markup items and suggest pricing haggle ranges).
      3. Simple localized customer velocity indicators (what should we promote to cashiers?).

      === CATALOG DETAILS ===
      ${productsContext || "No catalog items currently registered."}

      === RECENT TRANSACTION TIMELINE ===
      ${recentSalesContext}

      Provide a concise, scannable report in standard Markdown format. Focus strictly on realistic operational suggestions. Keep the tone professional, objective, and highly practical.
    `;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
    });

    res.json({ forecast: response.text });
  } catch (err: any) {
    console.error("Gemini Forecast Server Error:", err);
    res.status(500).json({ error: err.message || "Failed to generate AI insights." });
  }
});

export default app;
