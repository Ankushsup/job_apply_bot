const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const doc = new PDFDocument({ margin: 38, size: 'A4' });
const outputPath = path.join(__dirname, 'resume.pdf');
const stream = fs.createWriteStream(outputPath);

doc.pipe(stream);

// Styling colors
const primaryColor = '#0f2b5c'; // Deep Navy
const accentColor = '#059669';  // Emerald Green
const textColor = '#1f2937';    // Charcoal
const subColor = '#4b5563';     // Slate Gray

// Header
doc.fontSize(20).fillColor(primaryColor).font('Helvetica-Bold').text('ANKUSH UPADHYAY', { align: 'center' });
doc.fontSize(10.5).fillColor(subColor).font('Helvetica-Bold').text('Backend Engineer  |  Node.js  |  PostgreSQL  |  Redis  |  AWS', { align: 'center' });
doc.moveDown(0.2);
doc.fontSize(9).font('Helvetica').text('+91-8591684090  •  ankush.upadhyay2000@gmail.com  •  Mumbai, India', { align: 'center' });
doc.moveDown(0.15);
doc.fontSize(8.5).fillColor('#1d4ed8').text('LinkedIn: linkedin.com/in/aankush-upadhyay-5961441b6/  •  GitHub: github.com/Ankushsup', { align: 'center' });
doc.moveDown(0.2);
doc.fontSize(9.5).fillColor(accentColor).font('Helvetica-Bold').text('★ Immediately Available (No Notice Period) ★', { align: 'center' });
doc.moveDown(0.6);

function sectionTitle(title) {
  doc.fontSize(11).fillColor(primaryColor).font('Helvetica-Bold').text(title.toUpperCase());
  doc.strokeColor('#cbd5e1').lineWidth(0.8).moveTo(38, doc.y).lineTo(557, doc.y).stroke();
  doc.moveDown(0.3);
}

// Summary
sectionTitle('Professional Summary');
doc.fontSize(9.2).fillColor(textColor).font('Helvetica').text(
  'Backend Engineer with 3.5+ years of experience (including a 1-year internship) building production REST APIs and real-time applications. Strong in Node.js, Express.js, PostgreSQL, Redis, and AWS, with hands-on expertise in enterprise authentication (Keycloak, JWT, OTP), search optimization (Elasticsearch), WebRTC/Socket.io, and Docker-based deployments. Immediately available to join and deliver impact.',
  { lineGap: 2 }
);
doc.moveDown(0.6);

// Work Experience
sectionTitle('Work Experience');

function experienceHeader(role, company, dates, location) {
  doc.fontSize(10).fillColor(primaryColor).font('Helvetica-Bold').text(role, { continued: true });
  doc.fillColor(textColor).font('Helvetica').text(`  |  ${company}`);
  doc.fontSize(8.5).fillColor(subColor).text(`${dates}  •  ${location}`);
  doc.moveDown(0.2);
}

function bullet(text) {
  doc.fontSize(8.8).fillColor(textColor).font('Helvetica').text(`•  ${text}`, { indent: 8, lineGap: 1.4 });
}

experienceHeader('Software Developer – Backend', 'D-WebBox', 'June 2025 – October 2026', 'Mumbai, India');
bullet('MNM Fitness Platform: Built backend with Node.js and PostgreSQL; engineered real-time video/chat via WebRTC & Socket.io for 500+ concurrent users.');
bullet('Enterprise Security: Implemented Keycloak for authentication and RBAC, eliminating unauthorized access incidents.');
bullet('DevOps & Search: Containerized and deployed using Docker, AWS EC2, and Nginx (99.9% uptime); integrated Elasticsearch improving search speed by ~60%.');
bullet('GenWe EdTech Platform: Built OTP login via AWS SNS & Google reCAPTCHA, utilizing Redis for OTP expiration and active session management.');
bullet('User Matching: Developed real-time chat module and Python-based matching algorithm based on user interest graphs.');
bullet('BeRaw Influencer Platform: Engineered scalable referral system and brand-influencer collaboration APIs with PostgreSQL.');
bullet('CI/CD Pipeline: Automated CI/CD deployment workflows, reducing release errors and cutting deployment time by ~40%.');
doc.moveDown(0.5);

experienceHeader('Backend Developer (Intern to Software Developer)', 'Texple Technologies', 'Feb 2023 – June 2025', 'Mumbai, India');
bullet('REST API Engineering: Developed and maintained secure, high-throughput REST APIs with Node.js & Express.js for multi-client platforms.');
bullet('Authentication & RBAC: Built Role-Based Access Control and implemented JWT authentication with Active Directory integration.');
bullet('Database Optimization: Designed optimized PostgreSQL schemas, views, and stored procedures, cutting query execution times by 30%.');
bullet('Production Delivery: Progressed from intern contributing live code to owning critical backend services end-to-end.');
doc.moveDown(0.5);

// Key Projects
sectionTitle('Key Projects');
doc.fontSize(9.5).fillColor(primaryColor).font('Helvetica-Bold').text('Movie Ticket Booking Chatbot (WhatsApp)', { continued: true });
doc.fontSize(8.5).fillColor(subColor).font('Helvetica').text('  |  Node.js, Express.js, MongoDB, Meta WhatsApp Business API');
bullet('Engineered automated booking flows with WhatsApp webhooks, dynamic message templates, and stateful conversational sessions.');
doc.moveDown(0.5);

// Technical Skills
sectionTitle('Technical Skills');
doc.fontSize(8.8).fillColor(textColor).font('Helvetica-Bold').text('Languages: ', { continued: true })
   .font('Helvetica').text('JavaScript, Python');
doc.font('Helvetica-Bold').text('Backend & APIs: ', { continued: true })
   .font('Helvetica').text('Node.js, Express.js, NestJS, RESTful APIs, Microservices Architecture');
doc.font('Helvetica-Bold').text('Databases & Caching: ', { continued: true })
   .font('Helvetica').text('PostgreSQL, Redis, MongoDB, Elasticsearch');
doc.font('Helvetica-Bold').text('Cloud & DevOps: ', { continued: true })
   .font('Helvetica').text('AWS (EC2, SNS), Docker, Nginx, CI/CD Pipelines');
doc.font('Helvetica-Bold').text('Auth & Real-time: ', { continued: true })
   .font('Helvetica').text('Keycloak, JWT, OTP Systems, Google reCAPTCHA, RBAC, WebRTC, Socket.io');
doc.font('Helvetica-Bold').text('Tools: ', { continued: true })
   .font('Helvetica').text('Git, GitHub, Postman, Linux');
doc.moveDown(0.5);

// Education
sectionTitle('Education');
doc.fontSize(9).fillColor(primaryColor).font('Helvetica-Bold').text('Master of Computer Application (MCA)', { continued: true });
doc.fontSize(8.5).fillColor(subColor).font('Helvetica').text('  |  N.M.I.T.D, Dadar, Mumbai (2021 – 2023)');
doc.fontSize(9).fillColor(primaryColor).font('Helvetica-Bold').text('Bachelor of Science in Information Technology (B.Sc. IT)', { continued: true });
doc.fontSize(8.5).fillColor(subColor).font('Helvetica').text('  |  Niranjana Majithia College, Mumbai (2017 – 2020)');

doc.end();

stream.on('finish', () => {
  console.log(`Updated resume.pdf generated successfully at: ${outputPath}`);
});

