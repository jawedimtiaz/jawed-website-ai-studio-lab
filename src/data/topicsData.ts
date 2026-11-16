export interface TopicItem {
  id: string;
  name: string;
  eyebrow: string;
  description: string;
  notesSlugs: string[];
  toolsSlugs: string[];
}

export const topicsList: TopicItem[] = [
  {
    id: 'it-service-desk',
    name: 'IT & Service Desk',
    eyebrow: 'Core Topic · 6 notes',
    description: 'First-response troubleshooting, scoping user vs device vs service, ticket documentation, device lifecycle, and escalation handoffs.',
    notesSlugs: [
      'it-service-desk-troubleshooting-workflow',
      'service-desk-ticket-documentation',
      'scoping-it-issues-user-device-service',
      'device-provisioning-handoff-checklist',
      'it-support-escalation-handoff-checklist',
      'it-troubleshooting-guide-knowledge-base'
    ],
    toolsSlugs: [
      'service-desk-note-formatter',
      'it-troubleshooting-assistant',
      'ticket-to-knowledge-base-draft'
    ]
  },
  {
    id: 'apple-jamf',
    name: 'Apple / Jamf',
    eyebrow: 'Workplace Tech · 2 notes',
    description: 'macOS first response, device enrollment models (User, Device, Automated Device Enrollment), and Jamf Pro workplace management.',
    notesSlugs: [
      'apple-macos-first-response-checklist',
      'apple-device-management-enrollment-models'
    ],
    toolsSlugs: [
      'it-troubleshooting-assistant'
    ]
  },
  {
    id: 'microsoft',
    name: 'Microsoft & Windows',
    eyebrow: 'Workplace Tech · 2 notes',
    description: 'Windows 10/11 troubleshooting, Microsoft 365, Azure AD / Microsoft Entra ID sign-in triage, and MFA diagnostic checks.',
    notesSlugs: [
      'windows-first-response-troubleshooting-checklist',
      'microsoft-sign-in-troubleshooting-guide'
    ],
    toolsSlugs: [
      'it-troubleshooting-assistant'
    ]
  },
  {
    id: 'networking',
    name: 'Networking',
    eyebrow: 'Infrastructure · 2 notes',
    description: 'First-response connectivity checklist and OSI / TCP-IP layer-by-layer diagnostic frameworks from physical link to DNS and routing.',
    notesSlugs: [
      'network-connectivity-first-response-checklist',
      'networking-layer-by-layer-diagnostic-framework'
    ],
    toolsSlugs: [
      'it-troubleshooting-assistant'
    ]
  },
  {
    id: 'ai-productivity',
    name: 'AI & Productivity',
    eyebrow: 'Modern Workflow · 3 notes',
    description: 'Practical AI workflows for IT support, 4-part prompt patterns, tool evaluation frameworks, and privacy boundaries.',
    notesSlugs: [
      'ai-for-it-support-practical-workflow',
      'ai-prompting-everyday-work',
      'choosing-ai-tools-privacy-cost-fit'
    ],
    toolsSlugs: [
      'ai-prompt-builder'
    ]
  },
  {
    id: 'automation-web',
    name: 'Automation & Web',
    eyebrow: 'Efficiency · 3 notes',
    description: 'Practical scripting starting points, safe browser tool architecture, local processing boundaries, and Web APIs.',
    notesSlugs: [
      'small-it-automation-starting-point',
      'building-safe-browser-based-it-tools',
      'interactive-tools-ai-assisted-experiences-architecture',
      'apis-explained-for-it-support'
    ],
    toolsSlugs: [
      'service-desk-note-formatter',
      'ai-prompt-builder'
    ]
  },
  {
    id: 'personal-finance',
    name: 'Personal Finance & Investing',
    eyebrow: 'Financial Education · 11 notes',
    description: 'Transparent educational frameworks for budgeting, emergency funds, net worth, health insurance, tax regimes, mutual funds, US ETFs, inflation, and retirement planning.',
    notesSlugs: [
      'money-basics-budget-emergency-net-worth',
      'health-insurance-understanding-the-basics',
      'indian-income-tax-practical-starting-point',
      'new-vs-old-tax-regime-comparison',
      'us-stocks-etfs-starting-point',
      'indian-mutual-funds-index-etfs-starting-point',
      'portfolio-allocation-rebalancing-framework',
      'retirement-planning-start-with-the-number',
      'retirement-corpus-calculation-framework',
      'retirement-withdrawals-sequence-risk-income-review',
      'inflation-and-future-goal-planning'
    ],
    toolsSlugs: [
      'compound-growth-sip-calculator',
      'inflation-goal-planning-calculator',
      'personal-finance-snapshot',
      'retirement-planning-calculator',
      'finance-planning-workspace',
      'portfolio-tracker'
    ]
  }
];
