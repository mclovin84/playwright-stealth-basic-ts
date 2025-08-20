const express = require('express');
const officegen = require('officegen');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Your existing PDF generation route (keep it)
app.post('/generate-pdf', async (req, res) => {
  // Your existing Playwright PDF code here
});

// NEW: DOCX generation route
app.post('/generate-docx', async (req, res) => {
  try {
    const data = req.body;
    console.log('Generating DOCX for:', data.address?.full);
    
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
    
    // Add all the terms
    addAllTerms(docx, data);
    
    // Final paragraph
    docx.createP();
    const finalPara = docx.createP();
    finalPara.addText('This letter of intent is ');
    finalPara.addText('not intended', { bold: true });
    finalPara.addText(' to create a binding agreement on the Seller to sell or the Purchaser to buy. The purpose of this letter is to set forth the primary terms and conditions upon which to execute a formal Purchase and Sale Agreement. All other terms and conditions shall be negotiated in the formal Purchase and Sale Agreement. This letter of Intent is open for acceptance through ');
    finalPara.addText(data.acceptBy || 'TBD', { bold: true });
    finalPara.addText('.');
    
    // Add signature blocks
    addSignatureBlocks(docx, data);
    
    // Set response headers for DOCX download
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="LOI_${Date.now()}.docx"`);
    
    // Generate and send the document
    docx.generate(res);
    
  } catch (error) {
    console.error('DOCX generation error:', error);
    res.status(500).json({ error: 'Failed to generate DOCX', details: error.message });
  }
});

function addAllTerms(docx, data) {
  // Price
  const priceLine = docx.createP();
  priceLine.addText('Price: ', { bold: true });
  priceLine.addText(`$${data.price?.toLocaleString() || 'TBD'}`);
  
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
  
  // Add remaining terms following the same pattern...
}

function addSignatureBlocks(docx, data) {
  docx.createP();
  docx.createP();
  
  // Purchaser signature block
  const purchaserSig = docx.createP({ indent_left: 500 });
  purchaserSig.addText(`PURCHASER: ${data.buyerEntity || 'REK Partners'}`);
  
  docx.createP();
  docx.createP();
  
  const sigLine1 = docx.createP({ indent_left: 500 });
  sigLine1.addText('By: _____________________________________ Date:________________');
  
  // Add more signature lines as needed...
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Service running on port ${PORT}`);
  console.log(`PDF endpoint: /generate-pdf`);
  console.log(`DOCX endpoint: /generate-docx`);
});
