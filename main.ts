import express from 'express';
import { chromium } from 'playwright';
import archiver from 'archiver';

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
    endpoints: {
      pdf: '/generate-pdf',
      zip: '/create-zip'
    },
    message: 'POST html to /generate-pdf or pdfs array to /create-zip' 
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

// ZIP creation endpoint
app.post('/create-zip', async (req, res) => {
  try {
    console.log('ZIP endpoint called');
    const { pdfs } = req.body;
    
    // Validate input
    if (!pdfs || !Array.isArray(pdfs)) {
      console.log('No PDFs array provided');
      return res.status(400).json({ error: 'Please provide a pdfs array' });
    }
    
    console.log(`Creating ZIP with ${pdfs.length} files`);
    
    // Set response headers for ZIP file
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="LOI_Batch.zip"');
    
    // Create ZIP archive
    const archive = archiver('zip', { 
      zlib: { level: 9 } // Maximum compression
    });
    
    // Error handling
    archive.on('error', (err: Error) => {
      console.error('Archive error:', err);
      return res.status(500).json({ error: 'Failed to create ZIP' });
    });
    
    // Pipe the archive to response
    archive.pipe(res);
    
    // Add each PDF to archive
    pdfs.forEach((pdf: { data: string; filename?: string }, index: number) => {
      try {
        const buffer = Buffer.from(pdf.data, 'base64');
        const filename = pdf.filename || `LOI_${index + 1}.pdf`;
        archive.append(buffer, { name: filename });
        console.log(`Added ${filename} to ZIP`);
      } catch (err) {
        console.error(`Error adding file ${index}:`, err);
      }
    });
    
    // Finalize the archive
    await archive.finalize();
    console.log('ZIP created successfully');
    
  } catch (error) {
    console.error('ZIP creation error:', error);
    if (!res.headersSent) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to create ZIP';
      res.status(500).json({ error: errorMessage });
    }
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`PDF Service running on port ${PORT}`);
});
