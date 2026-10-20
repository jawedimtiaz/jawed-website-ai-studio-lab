import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { HardwareShowcase3D } from '../components/hardware/HardwareShowcase3D';

interface WorkPageProps {
  initialTab?: 'overview' | 'experience' | 'skills' | 'certifications' | 'projects';
}

export const WorkPage: React.FC<WorkPageProps> = ({ initialTab }) => {
  const location = useLocation();

  // Determine active tab based on route or prop
  let currentTab: 'overview' | 'experience' | 'skills' | 'certifications' | 'projects' = initialTab || 'overview';
  if (!initialTab) {
    if (location.pathname.includes('/experience')) currentTab = 'experience';
    else if (location.pathname.includes('/skills')) currentTab = 'skills';
    else if (location.pathname.includes('/certifications')) currentTab = 'certifications';
    else if (location.pathname.includes('/projects')) currentTab = 'projects';
    else currentTab = 'overview';
  }

  return (
    <main id="main-content" className="container page">
      <p className="eyebrow">Professional</p>
      <div className="breadcrumbs" style={{ fontSize: '0.875rem', color: 'var(--muted)', marginBottom: '1rem' }}>
        <Link to="/">Home</Link>
        <span style={{ margin: '0 0.5rem' }}>/</span>
        <Link to="/work/">Work</Link>
        {currentTab !== 'overview' && (
          <>
            <span style={{ margin: '0 0.5rem' }}>/</span>
            <span style={{ textTransform: 'capitalize', color: 'var(--text)', fontWeight: 600 }}>{currentTab}</span>
          </>
        )}
      </div>

      <h1 style={{ marginBottom: '1rem' }}>
        {currentTab === 'overview' && 'Work & Professional Profile'}
        {currentTab === 'experience' && 'Professional Experience'}
        {currentTab === 'skills' && 'Technical & Operational Skills'}
        {currentTab === 'certifications' && 'Certifications & Education'}
        {currentTab === 'projects' && 'Selected Projects & Case Studies'}
      </h1>

      <p className="lead" style={{ maxWidth: '48rem', marginBottom: '1.5rem' }}>
        {currentTab === 'overview' &&
          'My professional experience spans technical support, system administration, technical support management, Service Desk operations, and workplace technology.'}
        {currentTab === 'experience' &&
          'My career has developed across technical support, system administration, technical support management, and workplace technology.'}
        {currentTab === 'skills' &&
          'My technical and operational skills span IT support, workplace technology, Apple devices, MDM, IT operations, networking, and automation.'}
        {currentTab === 'certifications' &&
          'My credentials, certifications, historical qualifications, and ongoing professional learning.'}
        {currentTab === 'projects' &&
          'A selection of professional and personal projects related to technology, learning, and practical problem solving.'}
      </p>

      {/* Sub-navigation tabs */}
      <nav aria-label="Work navigation" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '2.5rem', borderBottom: '1px solid var(--line)', paddingBottom: '0.75rem' }}>
        <Link
          to="/work/"
          className={`button ${currentTab === 'overview' ? '' : 'button-secondary'}`}
          style={{ padding: '0.4rem 0.9rem', fontSize: '0.9rem' }}
        >
          Overview
        </Link>
        <Link
          to="/work/experience/"
          className={`button ${currentTab === 'experience' ? '' : 'button-secondary'}`}
          style={{ padding: '0.4rem 0.9rem', fontSize: '0.9rem' }}
        >
          Experience
        </Link>
        <Link
          to="/work/skills/"
          className={`button ${currentTab === 'skills' ? '' : 'button-secondary'}`}
          style={{ padding: '0.4rem 0.9rem', fontSize: '0.9rem' }}
        >
          Skills
        </Link>
        <Link
          to="/work/certifications/"
          className={`button ${currentTab === 'certifications' ? '' : 'button-secondary'}`}
          style={{ padding: '0.4rem 0.9rem', fontSize: '0.9rem' }}
        >
          Certifications
        </Link>
        <Link
          to="/work/projects/"
          className={`button ${currentTab === 'projects' ? '' : 'button-secondary'}`}
          style={{ padding: '0.4rem 0.9rem', fontSize: '0.9rem' }}
        >
          Projects
        </Link>
      </nav>

      {/* ===================== OVERVIEW TAB ===================== */}
      {currentTab === 'overview' && (
        <div>
          <div className="card-grid">
            <article className="card">
              <h2>Experience</h2>
              <p>My professional career, roles, and milestones held across IT support, systems, and field operations.</p>
              <Link to="/work/experience/" className="button button-secondary" style={{ marginTop: '0.75rem' }}>
                View Experience →
              </Link>
            </article>
            <article className="card">
              <h2>Skills</h2>
              <p>Technical and operational skills across Apple macOS, Windows, Jamf, Networking, ServiceNow, and Automation.</p>
              <Link to="/work/skills/" className="button button-secondary" style={{ marginTop: '0.75rem' }}>
                View Skills →
              </Link>
            </article>
            <article className="card">
              <h2>Certifications</h2>
              <p>AZ-900, historical MCSE &amp; Apple Certified Support Professional, degree, and current Jamf 100/ITIL learning.</p>
              <Link to="/work/certifications/" className="button button-secondary" style={{ marginTop: '0.75rem' }}>
                View Certifications →
              </Link>
            </article>
            <article className="card">
              <h2>Projects</h2>
              <p>Selected engineering case studies, website rebuild architecture, and sanitized work evidence.</p>
              <Link to="/work/projects/" className="button button-secondary" style={{ marginTop: '0.75rem' }}>
                View Projects →
              </Link>
            </article>
          </div>

          {/* Interactive 3D Hardware Infrastructure Showcase */}
          <section className="content-section" style={{ marginTop: '2.5rem' }}>
            <div style={{ marginBottom: '1.25rem' }}>
              <p className="eyebrow">Interactive 3D Field Demonstration</p>
              <h2 style={{ margin: '0 0 0.5rem' }}>Hands-On Hardware &amp; Rack Infrastructure</h2>
              <p style={{ color: 'var(--muted)', margin: 0, maxWidth: '48rem' }}>
                Explore my hands-on field experience with enterprise server racks, 10G SFP+ switches, SAS RAID arrays, dual redundant PDUs, and modular motherboard diagnostics. Click any component below to view field triage experience, failure modes, and credentials.
              </p>
            </div>
            <HardwareShowcase3D />
          </section>

          <section className="content-section" style={{ marginTop: '3rem' }}>
            <h2>Selected Work Evidence &amp; Methodology</h2>
            <p>See how practical IT support themes translate into repeatable, public-safe workflows:</p>
            <div className="card-grid">
              <article className="card">
                <h3>Incident Scoping &amp; Isolation</h3>
                <p>Distinguish whether the issue belongs to a single user, device, or wide service before changing configs.</p>
                <Link to="/notes/scoping-it-issues-user-device-service/">Read Scoping Note →</Link>
              </article>
              <article className="card">
                <h3>Structured macOS Diagnostics</h3>
                <p>First-response checks for network profiles, FileVault, Keychain, MDM sync, and system permissions.</p>
                <Link to="/notes/apple-macos-first-response-checklist/">Read macOS Checklist →</Link>
              </article>
              <article className="card">
                <h3>Repeatable Device Provisioning</h3>
                <p>Checklist covering preparation, identity verification, enrollment validation, and handoff documentation.</p>
                <Link to="/notes/device-provisioning-handoff-checklist/">Read Provisioning Guide →</Link>
              </article>
            </div>
          </section>

          <section className="content-section">
            <h2>Career Tools</h2>
            <p>Preparing for your next IT interview or role transition? Use my client-side career utilities:</p>
            <div className="actions" style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
              <Link className="button" to="/tools/career-match-resume-review/">
                Open Career Match Resume Review →
              </Link>
              <Link className="button button-secondary" to="/tools/interview-preparation-planner/">
                Open STAR Interview Planner →
              </Link>
            </div>
          </section>
        </div>
      )}

      {/* ===================== EXPERIENCE TAB ===================== */}
      {currentTab === 'experience' && (
        <div>
          <section className="content-section">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div>
                <h2 style={{ margin: 0 }}>IT Field Tech</h2>
                <p className="meta" style={{ color: 'var(--muted)', fontWeight: 600, margin: '0.25rem 0 1rem' }}>
                  Milestone Technologies, Inc. — supporting Uber environment
                </p>
              </div>
              <span className="badge">Current Role</span>
            </div>
            <p>
              Supporting users and workplace technology through IT Service Desk operations, hardware/software troubleshooting, device provisioning, and day-to-day enterprise operations.
            </p>

            <h3>Areas of responsibility</h3>
            <ul className="tag-list" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', listStyle: 'none', padding: 0 }}>
              {['IT Support', 'Service Desk Support', 'Troubleshooting', 'Workplace Technology', 'Apple/macOS Support', 'Device Provisioning', 'Device Management', 'IT Operations', 'Asset and Inventory Support', 'ServiceNow', 'Jira', 'Slack'].map((tag) => (
                <li key={tag} className="badge" style={{ background: 'var(--surface-accent)', color: 'var(--accent)' }}>
                  {tag}
                </li>
              ))}
            </ul>

            <h3 style={{ marginTop: '1.5rem' }}>Selected achievements &amp; Recognition</h3>
            <div className="stats-grid">
              <div className="stat">
                <strong>User Satisfaction</strong>
                <span>Consistently positive user feedback &amp; high CSAT ratings</span>
              </div>
              <div className="stat">
                <strong>People’s Choice Award</strong>
                <span>Uber Vizag COE recognition</span>
              </div>
              <div className="stat">
                <strong>The Solar Power Award</strong>
                <span>“Always charged up, even on Mondays”</span>
              </div>
              <div className="stat">
                <strong>Jugaad Genius Award</strong>
                <span>People’s Choice recognition for practical problem-solving</span>
              </div>
              <div className="stat">
                <strong>Tech Support Guru Award</strong>
                <span>People’s Choice recognition for technical support excellence</span>
              </div>
              <div className="stat">
                <strong>Employee of the Quarter</strong>
                <span>Formal recognition for performance and cross-team contribution</span>
              </div>
            </div>
          </section>

          <section className="content-section">
            <h2>Prior Professional Experience</h2>
            <div className="card-grid">
              <article className="card">
                <h3>Technical Support Manager</h3>
                <p className="meta" style={{ color: 'var(--muted)' }}>Currents Technology</p>
                <p>Led technical support operations and helped manage service delivery, user support escalation, and infrastructure reliability.</p>
              </article>
              <article className="card">
                <h3>System Executive</h3>
                <p className="meta" style={{ color: 'var(--muted)' }}>ICore</p>
                <p>Systems administration, infrastructure support, and frontline troubleshooting in an enterprise IT environment.</p>
              </article>
              <article className="card">
                <h3>System Administrator</h3>
                <p className="meta" style={{ color: 'var(--muted)' }}>Khadims</p>
                <p>Server administration, active directory management, network maintenance, and desktop support operations.</p>
              </article>
              <article className="card">
                <h3>Technical Support Executive</h3>
                <p className="meta" style={{ color: 'var(--muted)' }}>Altos</p>
                <p>Early technical support and IT operations, diagnosing client PC hardware, operating systems, and connectivity.</p>
              </article>
            </div>
          </section>

          <section className="content-section">
            <h2>How I Approach Support Work</h2>
            <p>
              My approach starts with the user’s task and the impact of the issue, then narrows the scope before making changes. I aim to use the least disruptive supported checks, confirm the result against the original workflow, and leave clear documentation for the next technician.
            </p>
            <ul style={{ paddingLeft: '1.25rem', lineHeight: 1.7 }}>
              <li><strong>Understand impact:</strong> Clarify what the user needs to do, what failed, and whether the issue affects one user, one device, or a wider service.</li>
              <li><strong>Gather evidence:</strong> Record the exact symptom, relevant context, and results of checks rather than treating an error message as a confirmed root cause.</li>
              <li><strong>Act within scope:</strong> Follow approved procedures and escalate when permissions, security-sensitive changes, or specialist investigation are needed.</li>
              <li><strong>Validate and hand off:</strong> Retest the original task, document what changed and what remains unresolved, and provide a clear next step.</li>
            </ul>
          </section>
        </div>
      )}

      {/* ===================== SKILLS TAB ===================== */}
      {currentTab === 'skills' && (
        <div>
          <section className="content-section">
            <h2>How I apply these skills</h2>
            <p>
              Support work is not just a list of tools. I start by clarifying what the user was trying to do, establish whether the symptoms follow a user, device, or service, and choose a low-risk check that can distinguish likely causes. After a change, I validate the original task, record the evidence, and identify when a specialist or service owner needs to take over.
            </p>
          </section>

          <div className="card-grid">
            <article className="card">
              <h2>IT Support &amp; Service Desk</h2>
              <ul style={{ paddingLeft: '1.2rem', lineHeight: 1.6 }}>
                <li>IT Support &amp; Field Support</li>
                <li>Service Desk Tier 1 &amp; Tier 2</li>
                <li>Root Cause Analysis &amp; Troubleshooting</li>
                <li>User Onboarding &amp; Offboarding</li>
                <li>Incident &amp; Request Handling</li>
                <li>Remote Desktop Diagnostics</li>
                <li>IT Operations &amp; Knowledge Base Authoring</li>
              </ul>
            </article>

            <article className="card">
              <h2>Apple &amp; Device Management</h2>
              <ul style={{ paddingLeft: '1.2rem', lineHeight: 1.6 }}>
                <li>macOS (Sonoma, Sequoia &amp; historical releases)</li>
                <li>Apple Hardware Diagnostics &amp; Config</li>
                <li>Apple Business Manager (ABM)</li>
                <li>Jamf Pro / Jamf School (MDM)</li>
                <li>Zero-Touch Device Provisioning</li>
                <li>Configuration Profiles &amp; FileVault</li>
              </ul>
            </article>

            <article className="card">
              <h2>IT Platforms &amp; Collaboration</h2>
              <ul style={{ paddingLeft: '1.2rem', lineHeight: 1.6 }}>
                <li>ServiceNow (Incident, Request, CMDB)</li>
                <li>Jira Service Management &amp; Confluence</li>
                <li>Slack Enterprise Grid</li>
                <li>Google Workspace Admin</li>
                <li>Microsoft 365 Admin Center</li>
                <li>Okta &amp; OneLogin SSO / MFA</li>
              </ul>
            </article>

            <article className="card">
              <h2>Networking &amp; Infrastructure</h2>
              <ul style={{ paddingLeft: '1.2rem', lineHeight: 1.6 }}>
                <li>TCP/IP, DHCP, DNS, Subnetting</li>
                <li>VPN (WireGuard, GlobalProtect, OpenVPN)</li>
                <li>Cisco Meraki &amp; Enterprise Wi-Fi (802.1X)</li>
                <li>Microsoft Azure Fundamentals (AZ-900)</li>
                <li>AWS Cloud Practitioner foundations</li>
                <li>Active Directory &amp; Group Policy</li>
              </ul>
            </article>

            <article className="card">
              <h2>Automation &amp; Scripting</h2>
              <ul style={{ paddingLeft: '1.2rem', lineHeight: 1.6 }}>
                <li>PowerShell administrative scripting</li>
                <li>macOS zsh / Bash shell scripting</li>
                <li>JavaScript &amp; Web Development</li>
                <li>Git version control &amp; GitHub workflows</li>
                <li>Automated ticket note formatting</li>
                <li>Reversible administrative workflows</li>
              </ul>
            </article>
          </div>

          <section className="content-section" style={{ marginTop: '2.5rem' }}>
            <h2>From Skill Label to Observable Support Work</h2>
            <div className="table-wrap" style={{ overflowX: 'auto', border: '1px solid var(--line)', borderRadius: '8px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead style={{ backgroundColor: 'var(--surface)' }}>
                  <tr>
                    <th style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--line)' }}>Skill Area</th>
                    <th style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--line)' }}>Observable Support Practice</th>
                    <th style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--line)' }}>Related Guide</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--line)', fontWeight: 600 }}>Service Desk &amp; Incident Triage</td>
                    <td style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--line)' }}>Record user goal, scope, symptoms, last known-good point; test lowest-risk hypotheses first.</td>
                    <td style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--line)' }}><Link to="/notes/it-service-desk-troubleshooting-workflow/">Troubleshooting Workflow</Link></td>
                  </tr>
                  <tr>
                    <td style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--line)', fontWeight: 600 }}>Apple &amp; Device Management</td>
                    <td style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--line)' }}>Confirm device ownership, enrollment context, and profile state before modifying settings.</td>
                    <td style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--line)' }}><Link to="/notes/apple-device-management-enrollment-models/">Enrollment Models</Link></td>
                  </tr>
                  <tr>
                    <td style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--line)', fontWeight: 600 }}>Identity &amp; SSO Collaboration</td>
                    <td style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--line)' }}>Separate authentication failure from app permissions and service health; check tokens &amp; logs.</td>
                    <td style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--line)' }}><Link to="/notes/microsoft-sign-in-troubleshooting-guide/">Sign-in Troubleshooting</Link></td>
                  </tr>
                  <tr>
                    <td style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--line)', fontWeight: 600 }}>Networking &amp; Enterprise VPN</td>
                    <td style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--line)' }}>Determine if issue follows device, network, or service; avoid assuming ping confirms full stack.</td>
                    <td style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--line)' }}><Link to="/notes/network-connectivity-first-response-checklist/">Connectivity Checklist</Link></td>
                  </tr>
                  <tr>
                    <td style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--line)', fontWeight: 600 }}>Ticket Documentation</td>
                    <td style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--line)' }}>Maintain time-ordered logs of observations, changes, and next owner for continuity.</td>
                    <td style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--line)' }}><Link to="/notes/service-desk-ticket-documentation/">Ticket Documentation</Link></td>
                  </tr>
                  <tr>
                    <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Automation &amp; Scripting</td>
                    <td style={{ padding: '0.75rem 1rem' }}>Target narrow, reversible operations; test sample input, validate outputs, and define fail-safes.</td>
                    <td style={{ padding: '0.75rem 1rem' }}><Link to="/notes/small-it-automation-starting-point/">Small Automation Guide</Link></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {/* ===================== CERTIFICATIONS TAB ===================== */}
      {currentTab === 'certifications' && (
        <div>
          <section className="content-section">
            <h2>Completed Certifications &amp; Qualifications</h2>
            <div className="card-grid">
              <article className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ margin: 0 }}>Microsoft Azure Fundamentals (AZ-900)</h3>
                  <span className="badge">Completed</span>
                </div>
                <p style={{ marginTop: '0.5rem', color: 'var(--muted)' }}>Microsoft Certified</p>
                <p>Cloud concepts, core Azure services, security, privacy, compliance, and cloud pricing.</p>
              </article>
              <article className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ margin: 0 }}>Advanced Diploma in Hardware &amp; Networking</h3>
                  <span className="badge">Completed</span>
                </div>
                <p style={{ marginTop: '0.5rem', color: 'var(--muted)' }}>Comprehensive Technical Diploma</p>
                <p>Computer hardware diagnostics, motherboard architecture, LAN/WAN topologies, router configs, and network protocols.</p>
              </article>
            </div>
          </section>

          <section className="content-section">
            <h2>Historical Qualifications</h2>
            <div className="card-grid">
              <article className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ margin: 0 }}>MCSE — Windows Server 2003</h3>
                  <span className="badge" style={{ background: '#e2e8f0', color: '#475569' }}>Historical</span>
                </div>
                <p style={{ marginTop: '0.5rem', color: 'var(--muted)' }}>Microsoft Certified Systems Engineer</p>
                <p>Enterprise directory services, domain infrastructure, DNS/WINS, and Windows Server systems.</p>
              </article>
              <article className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ margin: 0 }}>Apple Certified Support Professional (ACSP 10.9)</h3>
                  <span className="badge" style={{ background: '#e2e8f0', color: '#475569' }}>Historical</span>
                </div>
                <p style={{ marginTop: '0.5rem', color: 'var(--muted)' }}>OS X Mavericks</p>
                <p>Core macOS diagnostics, user accounts, file systems, network configuration, and peripheral troubleshooting.</p>
              </article>
              <article className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ margin: 0 }}>Apple Certified Support Professional (ACSP 10.11)</h3>
                  <span className="badge" style={{ background: '#e2e8f0', color: '#475569' }}>Historical</span>
                </div>
                <p style={{ marginTop: '0.5rem', color: 'var(--muted)' }}>OS X El Capitan</p>
                <p>macOS deployment, System Integrity Protection (SIP), security architecture, and system recovery.</p>
              </article>
            </div>
            <p style={{ color: 'var(--muted)', fontSize: '0.875rem', marginTop: '1rem' }}>
              Note: Apple credentials retain their original product-version names to identify historical achievements and are not presented as active vendor certifications.
            </p>
          </section>

          <section className="content-section">
            <h2>Current Learning</h2>
            <div className="card-grid two">
              <article className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ margin: 0 }}>Jamf 100 Course</h3>
                  <span className="badge">In progress</span>
                </div>
                <p style={{ marginTop: '0.5rem', color: 'var(--muted)' }}>Apple Enterprise Management</p>
                <p>Hands-on proficiency with Jamf Pro infrastructure, Smart Computer Groups, Policies, Configuration Profiles, and automated enrollment.</p>
              </article>
              <article className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ margin: 0 }}>ITIL 4 Foundation</h3>
                  <span className="badge">In progress</span>
                </div>
                <p style={{ marginTop: '0.5rem', color: 'var(--muted)' }}>IT Service Management</p>
                <p>Service value systems, four dimensions of service management, incident &amp; problem management, and change enablement.</p>
              </article>
            </div>
          </section>

          <section className="content-section">
            <h2>Education</h2>
            <div className="card" style={{ maxWidth: '30rem' }}>
              <h3 style={{ margin: '0 0 0.5rem' }}>Bachelor of Science (B.Sc.)</h3>
              <p style={{ margin: 0, color: 'var(--muted)' }}>University of Calcutta</p>
            </div>
          </section>
        </div>
      )}

      {/* ===================== PROJECTS TAB ===================== */}
      {currentTab === 'projects' && (
        <div>
          <section className="content-section">
            <article className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <h2 style={{ margin: 0 }}>Jawed.co.in Platform Rebuild</h2>
                <span className="badge">Modern Architecture</span>
              </div>
              <p style={{ marginTop: '0.75rem' }}>
                A complete rebuild and modernization project evolving a personal site into a mobile-first professional portfolio, comprehensive documentation hub, and privacy-preserving interactive web application.
              </p>
              <h3>Technology Stack</h3>
              <ul className="tag-list" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', listStyle: 'none', padding: 0 }}>
                {['React', 'TypeScript', 'Vite', 'Tailwind CSS', 'Static Retrieval AI', 'Zero Server Tracking'].map((tech) => (
                  <li key={tech} className="badge" style={{ background: 'var(--surface-accent)', color: 'var(--accent)' }}>
                    {tech}
                  </li>
                ))}
              </ul>
              <h3>Key Architecture Highlights</h3>
              <ul style={{ paddingLeft: '1.25rem', lineHeight: 1.7 }}>
                <li>Client-side local execution of all 12 IT and financial calculators with zero backend tracking.</li>
                <li>Fully grounded Jawed AI assistant with deterministic safety boundaries and source citations.</li>
                <li>Accessible semantic HTML, responsive viewport scaling, and keyboard-friendly navigation.</li>
                <li>30 structured technical guides with step-by-step checklists, scoping tables, and copy-ready notes.</li>
              </ul>
              <div style={{ marginTop: '1rem' }}>
                <Link to="/blog/rebuilding-jawed-co-in/" className="button button-secondary">
                  Read Case Study Article →
                </Link>
              </div>
            </article>
          </section>

          <section className="content-section">
            <h2>Selected Work Evidence &amp; Case Scenarios</h2>
            <p>
              These case studies describe reusable operational practices developed across thousands of support engagements:
            </p>
            <div className="card-grid">
              <article className="card">
                <p className="eyebrow">Troubleshooting</p>
                <h3>Turning First Response Into a Repeatable Workflow</h3>
                <p><strong>Context:</strong> Support tickets frequently arrive with incomplete symptoms like "Internet down" or "Laptop slow".</p>
                <p><strong>Approach:</strong> Establish exact user goal, verify scope (one device vs. all devices on subnet), test physical &amp; DNS layers, isolate variables, and validate fix.</p>
                <Link to="/notes/it-service-desk-troubleshooting-workflow/">Read Full Workflow →</Link>
              </article>
              <article className="card">
                <p className="eyebrow">Device Lifecycle</p>
                <h3>Zero-Friction Device Provisioning &amp; Handoff</h3>
                <p><strong>Context:</strong> Device provisioning fails if security profiles, disk encryption, or identity tokens are not verified prior to employee delivery.</p>
                <p><strong>Approach:</strong> Systematic 5-stage verification (hardware check, OS baseline, MDM enrollment, profile validation, and signed user handoff).</p>
                <Link to="/notes/device-provisioning-handoff-checklist/">Read Provisioning Guide →</Link>
              </article>
              <article className="card">
                <p className="eyebrow">Documentation</p>
                <h3>Turning Live Triage into Useful Ticket History</h3>
                <p><strong>Context:</strong> Unstructured ticket notes cause duplicate effort when tickets are transferred or escalated.</p>
                <p><strong>Approach:</strong> Formatted five-point structure: User Goal, Symptoms &amp; Timestamps, Hypotheses Tested, Changes Made, and Explicit Next Owner.</p>
                <Link to="/tools/service-desk-note-formatter/">Open Note Formatter →</Link>
              </article>
            </div>
          </section>
        </div>
      )}

      {/* Shared Bottom Actions */}
      <section className="content-section" style={{ borderTop: '1px solid var(--line)', paddingTop: '2rem', marginTop: '3rem' }}>
        <h2>Continue Exploring</h2>
        <div className="actions" style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <Link className="button button-secondary" to="/notes/">
            Explore Technical Notes →
          </Link>
          <Link className="button button-secondary" to="/tools/">
            Launch Interactive Tools →
          </Link>
          <Link className="button" to="/contact/">
            Contact Jawed →
          </Link>
        </div>
      </section>
    </main>
  );
};
