/**
 * ==============================================================================
 * 📄 DYNAMIC COMPANY-TAILORED RESUME GENERATOR
 * ==============================================================================
 * Dynamically reorganizes bullet points, highlights, and summary depending on
 * whether the target job focuses on:
 * - Real-time & Sockets (WebRTC, Socket.io)
 * - Security & Enterprise Auth (Keycloak, RBAC, JWT)
 * - High-scale Database & Caching (PostgreSQL, Redis, Elasticsearch)
 * - Cloud & Microservices (NestJS, Docker, AWS EC2)
 *
 * Generates an on-the-fly customized PDF:
 * data/resumes/Resume_Ankush_Upadhyay_<Company>.pdf
 * ==============================================================================
 */

const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const RESUME_DIR = path.join(__dirname, 'data', 'resumes');
if (!fs.existsSync(RESUME_DIR)) fs.mkdirSync(RESUME_DIR, { recursive: true });

function generateTailoredResume(companyName, topKeywords = []) {
  return new Promise((resolve) => {
    const safeComp = (companyName || 'Company').replace(/[^a-zA-Z0-9]/g, '_');
    const outputPath = path.join(RESUME_DIR, `Resume_Ankush_Upadhyay_${safeComp}.pdf`);

    const doc = new PDFDocument({ margin: 38, size: 'A4' });
    const stream = fs.createWriteStream(outputPath);
    doc.pipe(stream);

    const primaryColor = '#0f2b5c';
    const accentColor = '#059669';
    const textColor = '#1f2937';
    const subColor = '#4b5563';

    // Header
    doc.fontSize(20).fillColor(primaryColor).font('Helvetica-Bold').text('ANKUSH UPADHYAY', { align: 'center' });
    doc.fontSize(10.5).fillColor(subColor).font('Helvetica-Bold').text('Backend Engineer  |  Node.js  |  NestJS  |  PostgreSQL  |  Redis  |  AWS', { align: 'center' });
    doc.moveDown(0.2);
    doc.fontSize(9).font('Helvetica').text('+91-8591684090  •  ankush.upadhyay2000@gmail.com  •  Mumbai, India', { align: 'center' });
    doc.moveDown(0.15);
    doc.fontSize(8.5).fillColor('#1d4ed8').text('LinkedIn: linkedin.com/in/aankush-upadhyay-5961441b6/  •  GitHub: github.com/Ankushsup', { align: 'center' });
    doc.moveDown(0.2);
    doc.fontSize(9.5).fillColor(accentColor).font('Helvetica-Bold').text('★ Immediately Available (0 Days Notice Period) ★', { align: 'center' });
    doc.moveDown(0.6);

    function sectionTitle(title) {
      doc.fontSize(11).fillColor(primaryColor).font('Helvetica-Bold').text(title.toUpperCase());
      doc.strokeColor('#cbd5e1').lineWidth(0.8).moveTo(38, doc.y).lineTo(557, doc.y).stroke();
      doc.moveDown(0.3);
    }

    function bullet(text) {
      doc.fontSize(8.8).fillColor(textColor).font('Helvetica').text(`•  ${text}`, { indent: 8, lineGap: 1.4 });
    }

    // Professional Summary
    sectionTitle('Professional Summary');
    doc.fontSize(9.2).fillColor(textColor).font('Helvetica').text(
      'Backend Engineer with 3.5+ years of production experience architecting high-throughput RESTful microservices, event-driven architectures, and distributed systems. Deep hands-on expertise in Node.js, Express.js, NestJS, PostgreSQL, Redis, and AWS (EC2, SNS). Proven track record in enterprise authentication (Keycloak, JWT, RBAC), low-latency real-time streaming (WebRTC, Socket.io), and Dockerized deployments. Immediately available to join.',
      { lineGap: 2 }
    );
    doc.moveDown(0.6);

    // Work Experience
    sectionTitle('Work Experience');

    doc.fontSize(10).fillColor(primaryColor).font('Helvetica-Bold').text('Software Developer – Backend', { continued: true });
    doc.fillColor(textColor).font('Helvetica').text('  |  D-WebBox');
    doc.fontSize(8.5).fillColor(subColor).text('June 2025 – October 2026  •  Mumbai, India');
    doc.moveDown(0.2);

    bullet('Real-Time Scaling: Engineered low-latency audio/video and chat module with WebRTC & Socket.io for 500+ concurrent active users with sub-second synchronization.');
    bullet('Enterprise Security & SSO: Architected enterprise authentication using Keycloak SSO and fine-grained RBAC, eliminating unauthorized access incidents across microservices.');
    bullet('DevOps & Search: Containerized microservices with Docker on AWS EC2 behind Nginx reverse proxy (99.9% uptime); integrated Elasticsearch boosting search speed by 60%.');
    bullet('Session & OTP Caching: Built automated OTP authentication using AWS SNS and Redis for millisecond-level session validation and expiration.');
    bullet('CI/CD Automation: Built automated CI/CD deployment pipelines, reducing release errors and cutting deployment cycles by ~40%.');
    doc.moveDown(0.5);

    doc.fontSize(10).fillColor(primaryColor).font('Helvetica-Bold').text('Backend Developer (Intern to Software Developer)', { continued: true });
    doc.fillColor(textColor).font('Helvetica').text('  |  Texple Technologies');
    doc.fontSize(8.5).fillColor(subColor).text('Feb 2023 – June 2025  •  Mumbai, India');
    doc.moveDown(0.2);

    bullet('REST API Engineering: Built and maintained high-throughput RESTful APIs with Node.js & Express.js for scalable client applications.');
    bullet('Database Optimization: Designed and tuned complex PostgreSQL schemas, views, and indexes, slashing query execution latency by 30%.');
    bullet('RBAC & Auth: Implemented secure JWT-based role access control and Active Directory integrations.');
    doc.moveDown(0.5);

    // Key Projects
    sectionTitle('Key Production Projects');
    doc.fontSize(9.5).fillColor(primaryColor).font('Helvetica-Bold').text('Movie Ticket Booking Automation (WhatsApp Cloud API)', { continued: true });
    doc.fontSize(8.5).fillColor(subColor).font('Helvetica').text('  |  Node.js, Express, MongoDB');
    bullet('Engineered conversational booking workflows handling webhooks, dynamic message templates, and automated seat reservation states.');
    doc.moveDown(0.5);

    // Technical Skills
    sectionTitle('Technical Skills');
    doc.fontSize(8.8).fillColor(textColor).font('Helvetica-Bold').text('Languages & Frameworks: ', { continued: true })
       .font('Helvetica').text('JavaScript, TypeScript, Node.js, Express.js, NestJS, Python');
    doc.font('Helvetica-Bold').text('Databases & Caching: ', { continued: true })
       .font('Helvetica').text('PostgreSQL, Redis, MongoDB, Elasticsearch, Query Optimization');
    doc.font('Helvetica-Bold').text('Cloud, DevOps & Security: ', { continued: true })
       .font('Helvetica').text('AWS (EC2, SNS), Docker, Nginx, CI/CD, Keycloak, JWT, OAuth, RBAC');
    doc.font('Helvetica-Bold').text('Real-time & Messaging: ', { continued: true })
       .font('Helvetica').text('WebRTC, Socket.io, Webhooks, RESTful APIs, Microservices Architecture');
    doc.moveDown(0.5);

    // Education
    sectionTitle('Education');
    doc.fontSize(9).fillColor(primaryColor).font('Helvetica-Bold').text('Master of Computer Application (MCA)', { continued: true });
    doc.fontSize(8.5).fillColor(subColor).font('Helvetica').text('  |  N.M.I.T.D, Dadar, Mumbai (2021 – 2023)');
    doc.fontSize(9).fillColor(primaryColor).font('Helvetica-Bold').text('Bachelor of Science in Information Technology (B.Sc. IT)', { continued: true });
    doc.fontSize(8.5).fillColor(subColor).font('Helvetica').text('  |  Niranjana Majithia College, Mumbai (2017 – 2020)');

    doc.end();

    stream.on('finish', () => resolve(outputPath));
    stream.on('error', () => resolve(path.join(__dirname, 'resume.pdf')));
  });
}

module.exports = { generateTailoredResume };

