import express from 'express';
import { chromium } from 'playwright';

const app = express();
app.use(express.json({ limit: '10mb' }));

// Enable CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Access-Control-Allow-Methods', 'GET, POST');
  next();
});

// Health check
app.get('/', (req, res) => {
  res.json({ 
    status: 'PDF Service Ready', 
    endpoint: '/generate-pdf',
    message: 'POST html content to /generate-pdf' 
  });
});

// PDF generation endpoint
app.post('/generate-pdf', async (req, res) => {
  let browser;
  try {
    const { html } = req.body;
    if (!html) {
      return res.status(400).json({ error: 'HTML content required' });
    }
    
    console.log('Generating PDF...');
    browser = await chromium.launch({ 
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle' });
    
    const pdf = await page.pdf({ 
      format: 'Letter',
      printBackground: true,
      margin: {
        top: '1in',
        right: '1in',
        bottom: '1in',
        left: '1in'
      }
    });
    
    await browser.close();
    
    res.contentType('application/pdf');
    res.send(pdf);
    console.log('PDF generated successfully');
    
  } catch (error) {
    console.error('PDF generation error:', error);
    if (browser) await browser.close();
    
    // TypeScript-safe error handling
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    res.status(500).json({ error: errorMessage });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`PDF Service running on port ${PORT}`);
});
