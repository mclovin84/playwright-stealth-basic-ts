import express from 'express';
import { chromium } from 'playwright';
import archiver from 'archiver';
import * as officegen from 'officegen'; // Add this import

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
    status: 'PDF & DOCX Service Ready', 
    endpoints: {
      pdf: '/generate-pdf',
      docx: '/generate-docx', // Add this line
      zip: '/create-zip'
    },
    message: 'POST html to /generate-pdf, LOI data to /generate-docx, or pdfs array to /create-zip' 
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

// DOCX generation endpoint
app.post('/generate-docx', async (req, res) => {
  try {
    const data = req.body;
    console.log('Generating DOCX for:', data.address?.full || 'Unknown address');
    
    // Create DOCX document
    const docx = officegen('docx');
    
    // Set document properties
    docx.setDocTitle('Letter of Intent');
    docx.setDocAuthor(data.buyerEntity || 'REK Partners');
    
    // Add header - Letter of Intent (centered, underlined)
    const header = docx.createP({ align: 'center' });
    header.addText('Letter of Intent', { 
      bold: true, 
      underline: true, 
      font_size: 14 
    });
    
    docx.createP(); // spacing
    
    // DATE line
    const dateLine = docx.createP();
    dateLine.addText('DATE: ', { bold: true });
    dateLine.addText(data.today || new Date().toLocaleDateString());
    
    // Purchaser line
    const purchaserLine = docx.createP();
    purchaserLine.addText('Purchaser: ', { bold: true });
    purchaserLine.addText(data.buyerEntity || 'REK Partners or 1057-9 E 15th LLC & 514 Olpp Ave LLC');
    
    // Property RE line  
    const propertyLine = docx.createP();
    propertyLine.addText(`RE: ${data.address?.full || data.address} ("the Property")`, { 
      bold: true, 
      font_size: 11 
    });
    
    docx.createP(); // spacing
    
    // Intro paragraph
    const intro = docx.createP();
    intro.addText('This ');
    intro.addText('non-binding letter', { bold: true });
    intro.addText(' represents Purchaser\'s intent to purchase the above captioned property (the "Property") including the land and improvements on the following terms and conditions:');
    
    docx.createP(); // spacing
    
    // Add terms
    addTermsToDoc(docx, data);
    
    // Final paragraph
    docx.createP();
    const finalPara = docx.createP();
    finalPara.addText('This letter of intent is ');
    finalPara.addText('not intended', { bold: true });
    finalPara.addText(' to create a binding agreement on the Seller to sell or the Purchaser to buy. The purpose of this letter is to set forth the primary terms and conditions upon which to execute a formal Purchase and Sale Agreement. All other terms and conditions shall be negotiated in the formal Purchase and Sale Agreement. This letter of Intent is open for acceptance through ');
    finalPara.addText(data.acceptBy || 'TBD', { bold: true });
    finalPara.addText('.');
    
    // Add signature blocks
    addSignatureBlocksToDoc(docx, data);
    
    // Set response headers for DOCX download
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="LOI_${Date.now()}.docx"`);
    
    // Generate and send the document
    docx.generate(res);
    console.log('DOCX generated successfully');
    
  } catch (error) {
    console.error('DOCX generation error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to generate DOCX';
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

// Helper function for adding terms
function addTermsToDoc(docx: any, data: any) {
  // Price
  const priceLine = docx.createP();
  priceLine.addText('Price: ', { bold: true });
  priceLine.addText(`$${data.price?.toLocaleString() || 'TBD'}`, { bold: true });
  
  // Financing  
  docx.createP();
  const financingLine = docx.createP();
  financingLine.addText('Financing: ', { bold: true });
  financingLine.addText(`Purchaser intends to obtain a loan of roughly $${data.financing?.toLocaleString() || 'TBD'} commercial financing priced at prevailing interest rates.`);
  
  // Earnest Money
  docx.createP();
  const earnestLine = docx.createP();
  earnestLine.addText('Earnest Money: ', { bold: true });
  earnestLine.addText(`Concurrently with full execution of a Purchase & Sale Agreement, Purchaser shall make an earnest money deposit ("The Initial Deposit") with a mutually agreed upon escrow agent in the amount of USD $${data.earnest1?.toLocaleString() || 'TBD'} to be held in escrow and applied to the purchase price at closing. On expiration of the Due Diligence, Purchaser will pay a further $${data.earnest2?.toLocaleString() || 'TBD'} deposit towards the purchase price and the combined $${data.totalEarnest?.toLocaleString() || 'TBD'} will be fully non-refundable.`);
  
  // Due Diligence
  docx.createP();
  const ddLine = docx.createP();
  ddLine.addText('Due Diligence: ', { bold: true });
  ddLine.addText('Purchaser shall have 45 calendar days due diligence period from the time of the execution of a formal Purchase and Sale Agreement and receipt of relevant documents.');
  
  // Indented sub-point
  const ddSub = docx.createP({ indent_left: 1000 });
  ddSub.addText('Seller to provide all books and records within 3 business day of effective contract date, including HOA resale certificates, property disclosures, 3 years of financial statements, pending litigation, and all documentation related to sewage intrusion.');
  
  // Title Contingency
  docx.createP();
  const titleLine = docx.createP();
  titleLine.addText('Title Contingency: ', { bold: true });
  titleLine.addText('Seller shall be ready, willing and able to deliver free and clear title to the Property at closing, subject to standard title exceptions acceptable to Purchaser.');
  
  const titleSub = docx.createP({ indent_left: 1000 });
  titleSub.addText('Purchaser to select title and escrow companies.');
  
  // Appraisal Contingency
  docx.createP();
  const appraisalLine = docx.createP();
  appraisalLine.addText('Appraisal Contingency: ', { bold: true });
  appraisalLine.addText('None');
  
  // Buyer Contingency
  docx.createP();
  const buyerLine = docx.createP();
  buyerLine.addText('Buyer Contingency: ', { bold: true });
  buyerLine.addText('Purchaser\'s obligation to purchase is contingent upon Purchaser\'s successful sale of its Ohio property as part of a Section 1031 like-kind exchange, with Seller agreeing to reasonably cooperate (at no additional cost or liability to Seller).');
  
  const buyerSub = docx.createP({ indent_left: 1000 });
  buyerSub.addText('Purchaser\'s obligation to purchase is contingent upon HOA approval of bulk sale.');
  
  // Closing
  docx.createP();
  const closingLine = docx.createP();
  closingLine.addText('Closing: ', { bold: true });
  closingLine.addText('Closing shall occur after completion of due diligence period on a date agreed to by Purchaser and Seller and further detailed in the Purchase and Sale Agreement. Closing shall not take place any sooner that 45 days from the execution of a formal Purchase and Sale Agreement.');
  
  const closingSub = docx.createP({ indent_left: 1000 });
  closingSub.addText('Purchaser and Seller agree to a one (1) time 15-day optional extension for closing.');
  
  // Closing Costs
  docx.createP();
  const costsLine = docx.createP();
  costsLine.addText('Closing Costs: ', { bold: true });
  costsLine.addText('Purchaser shall pay the cost of obtaining a title commitment and an owner\'s policy of title insurance.');
  
  const costsSub1 = docx.createP({ indent_left: 1000 });
  costsSub1.addText('Seller shall pay for documentary stamps on the deed conveying the Property to Purchaser.');
  
  const costsSub2 = docx.createP({ indent_left: 1000 });
  costsSub2.addText('Seller and Listing Broker to execute a valid Brokerage Referral Agreement with Buyer\'s brokerage providing for 3% commission payable to Buyer\'s Brokerage.');
  
  // Purchase Contract
  docx.createP();
  const contractLine = docx.createP();
  contractLine.addText('Purchase Contract: ', { bold: true });
  contractLine.addText('Pending receipt of sufficient information from Seller, Purchaser shall have (5) business days from mutual execution of this Letter of Intent agreement to submit a purchase and sale agreement.');
}

// Helper function for signature blocks
function addSignatureBlocksToDoc(docx: any, data: any) {
  docx.createP();
  docx.createP();
  
  // Purchaser signature block
  const purchaserSig = docx.createP({ indent_left: 500 });
  purchaserSig.addText(`PURCHASER: ${data.buyerEntity || 'REK Partners'}`);
  
  docx.createP();
  docx.createP();
  
  const sigLine1 = docx.createP({ indent_left: 500 });
  sigLine1.addText('By: _____________________________________ Date:________________');
  
  docx.createP();
  
  const nameLine1 = docx.createP({ indent_left: 500 });
  nameLine1.addText('Name: _________________________________________________');
  
  // Seller signature block
  docx.createP();
  docx.createP();
  
  const agreedLine = docx.createP({ indent_left: 500 });
  agreedLine.addText('Agreed and Accepted:', { bold: true, italic: true, underline: true });
  
  docx.createP();
  docx.createP();
  
  const sellerSig = docx.createP({ indent_left: 500 });
  sellerSig.addText(`SELLER: ${data.owner || 'Property Owner'}`);
  
  docx.createP();
  docx.createP();
  docx.createP();
  
  const sigLine2 = docx.createP({ indent_left: 500 });
  sigLine2.addText('By: _____________________________________ Date:________________');
  
  docx.createP();
  
  const nameLine2 = docx.createP({ indent_left: 500 });
  nameLine2.addText('Name: _________________________________________________');
  
  docx.createP();
  
  const titleLine = docx.createP({ indent_left: 500 });
  titleLine.addText('Title: __________________________________________________');
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`PDF & DOCX Service running on port ${PORT}`);
});
