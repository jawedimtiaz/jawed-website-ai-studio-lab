import React, { useEffect } from 'react';
import { useLocation, matchPath } from 'react-router-dom';
import { notesList, getNoteCategory } from '../../data/notesData';
import { toolsList } from '../../data/toolsData';
import { blogPosts } from '../../data/blogData';

export const DocumentHead: React.FC = () => {
  const { pathname } = useLocation();

  useEffect(() => {
    let title = 'Jawed Imtiaz | IT Support & Workplace Technology';
    let description =
      'IT Field Tech portfolio, practical troubleshooting guides, interactive browser-based IT & finance tools, and Jawed AI assistant.';
    const canonicalUrl = `https://jawed.co.in${pathname.endsWith('/') ? pathname : pathname + '/'}`;

    // Normalize path by stripping trailing slash for matching
    const cleanPath = pathname.replace(/\/$/, '') || '/';
    const isPrivateHq = cleanPath === '/studio-hq' || cleanPath.startsWith('/studio-hq/');

    if (isPrivateHq) {
      title = 'Jawed Web Studio HQ | Private Workspace';
      description = 'Private owner-only workspace for Jawed Web Studio operations.';
    } else if (cleanPath === '/') {
      title = 'Jawed Imtiaz | IT Support & Workplace Technology';
      description =
        'IT Field Tech portfolio, practical troubleshooting guides, interactive browser-based IT & finance tools, and Jawed AI assistant.';
    } else if (cleanPath === '/about') {
      title = 'About Jawed Imtiaz | IT Field Tech';
      description =
        'Learn about Jawed Imtiaz, his IT career, professional interests, education, current learning, and the story behind Jawed.co.in.';
    } else if (cleanPath === '/work') {
      title = 'IT Support Experience & Skills | Jawed Imtiaz';
      description =
        'Explore Jawed Imtiaz’s IT support experience, technical skills, certifications, and practical workplace technology projects.';
    } else if (cleanPath === '/work/experience') {
      title = 'Experience & Highlights | Jawed Imtiaz';
      description =
        'Jawed Imtiaz’s professional experience across IT support, Service Desk operations, system administration, and workplace technology.';
    } else if (cleanPath === '/work/skills') {
      title = 'Skills & Practice | Jawed Imtiaz';
      description =
        'Technical and operational skills across IT support, workplace technology, Apple devices, device management, networking, and automation.';
    } else if (cleanPath === '/work/certifications') {
      title = 'Certifications & Education | Jawed Imtiaz';
      description =
        'Jawed Imtiaz’s certifications, education, historical qualifications, and current learning (AZ-900, Jamf 100, ITIL).';
    } else if (cleanPath === '/work/projects') {
      title = 'Projects & Selected Work Evidence | Jawed Imtiaz';
      description =
        'Selected professional and personal projects by Jawed Imtiaz, including website architecture and IT case studies.';
    } else if (cleanPath === '/notes') {
      title = 'Technical & Practical Notes | Jawed Imtiaz';
      description =
        '30 practical, field-tested guides, diagnostic workflows, step-by-step checklists, and foundational financial notes.';
    } else if (cleanPath.startsWith('/notes/')) {
      const slug = cleanPath.replace('/notes/', '');
      const note = notesList.find((n) => n.slug === slug);
      if (note) {
        title = `${note.title} | Jawed Imtiaz`;
        description = note.summary || note.lead;
      }
    } else if (cleanPath === '/tools') {
      title = 'Interactive Browser Utilities & Tools | Jawed Imtiaz';
      description =
        'A suite of 14 privacy-preserving, client-side browser utilities across IT Support, Apple/Jamf, Microsoft 365, Career, and Planning.';
    } else if (cleanPath.startsWith('/tools/')) {
      const slug = cleanPath.replace('/tools/', '');
      const tool = toolsList.find((t) => t.slug === slug);
      if (tool) {
        title = `${tool.title} | Interactive Tool | Jawed Imtiaz`;
        description = `${tool.benefit} ${tool.description}`;
      }
    } else if (cleanPath === '/blog') {
      title = 'Blog & Technical Case Studies | Jawed Imtiaz';
      description =
        'Detailed engineering retrospectives, operational problem-solving writeups, and workplace technology case studies.';
    } else if (cleanPath.startsWith('/blog/')) {
      const slug = cleanPath.replace('/blog/', '');
      const post = blogPosts.find((p) => p.slug === slug);
      if (post) {
        title = `${post.title} | Jawed Imtiaz`;
        description = post.summary || post.lead;
      }
    } else if (cleanPath === '/topics') {
      title = 'Topics & Knowledge Areas | Jawed Imtiaz';
      description =
        'Explore technical guides, checklists, and interactive tools organized by functional area and taxonomy.';
    } else if (cleanPath === '/resources') {
      title = 'IT & Planning Resources | Jawed Imtiaz';
      description =
        'A curated inventory of official vendor documentation, standards, and authoritative references across Apple, Microsoft, and ITIL.';
    } else if (cleanPath === '/ai') {
      title = 'Jawed AI | Explore IT, Tools & Notes';
      description =
        'A focused assistant for discovering practical IT notes, browser tools, resources, and work-related knowledge on Jawed.co.in.';
    } else if (cleanPath === '/contact') {
      title = 'Contact Jawed Imtiaz | IT Support & Projects';
      description =
        'Contact Jawed Imtiaz about IT support opportunities, workplace technology projects, tool feedback, or collaboration.';
    } else if (cleanPath === '/privacy') {
      title = 'Privacy & Data Handling Policy | Jawed Imtiaz';
      description =
        'How Jawed.co.in handles contact messages, browser-based tools, local storage, analytics, third-party services, and privacy choices.';
    }

    // Update document title
    document.title = title;

    // Update or create meta description
    let metaDesc = document.querySelector('meta[name="description"]');
    if (!metaDesc) {
      metaDesc = document.createElement('meta');
      metaDesc.setAttribute('name', 'description');
      document.head.appendChild(metaDesc);
    }
    metaDesc.setAttribute('content', description);

    // Private HQ must not advertise a public canonical URL.
    let canonicalTag = document.querySelector('link[rel="canonical"]');
    if (isPrivateHq) {
      canonicalTag?.remove();
    } else {
      if (!canonicalTag) {
        canonicalTag = document.createElement('link');
        canonicalTag.setAttribute('rel', 'canonical');
        document.head.appendChild(canonicalTag);
      }
      canonicalTag.setAttribute('href', canonicalUrl);
    }

    // Keep the owner-only workspace out of search indexes.
    let robotsTag = document.querySelector('meta[name="robots"]');
    if (isPrivateHq) {
      if (!robotsTag) {
        robotsTag = document.createElement('meta');
        robotsTag.setAttribute('name', 'robots');
        document.head.appendChild(robotsTag);
      }
      robotsTag.setAttribute('content', 'noindex, nofollow, noarchive');
      robotsTag.setAttribute('data-private-hq', 'true');
    } else if (robotsTag?.getAttribute('data-private-hq') === 'true') {
      robotsTag.remove();
    }

    // Update OpenGraph Title & Description
    let ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) ogTitle.setAttribute('content', title);

    let ogDesc = document.querySelector('meta[property="og:description"]');
    if (ogDesc) ogDesc.setAttribute('content', description);

    let ogUrl = document.querySelector('meta[property="og:url"]');
    if (ogUrl) ogUrl.setAttribute('content', canonicalUrl);

    // Update Twitter Title & Description
    let twTitle = document.querySelector('meta[name="twitter:title"]');
    if (twTitle) twTitle.setAttribute('content', title);

    let twDesc = document.querySelector('meta[name="twitter:description"]');
    if (twDesc) twDesc.setAttribute('content', description);

    // Generate and inject Schema.org JSON-LD Structured Data
    let jsonLdData: any = null;

    if (isPrivateHq) {
      jsonLdData = null;
    } else if (cleanPath === '/') {
      jsonLdData = {
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'WebSite',
            '@id': 'https://jawed.co.in/#website',
            'url': 'https://jawed.co.in/',
            'name': 'Jawed Imtiaz',
            'description': description
          },
          {
            '@type': 'Person',
            '@id': 'https://jawed.co.in/#person',
            'name': 'Jawed Imtiaz',
            'url': 'https://jawed.co.in/',
            'jobTitle': 'IT Field Tech',
            'worksFor': {
              '@type': 'Organization',
              'name': 'Milestone Technologies'
            },
            'sameAs': ['https://www.linkedin.com/in/jawedimtiaz/']
          }
        ]
      };
    } else if (cleanPath === '/about') {
      jsonLdData = {
        '@context': 'https://schema.org',
        '@type': 'ProfilePage',
        'url': canonicalUrl,
        'name': title,
        'description': description,
        'mainEntity': {
          '@type': 'Person',
          'name': 'Jawed Imtiaz',
          'jobTitle': 'IT Field Tech',
          'sameAs': ['https://www.linkedin.com/in/jawedimtiaz/']
        }
      };
    } else if (cleanPath.startsWith('/notes/')) {
      const slug = cleanPath.replace('/notes/', '');
      const note = notesList.find((n) => n.slug === slug);
      if (note) {
        jsonLdData = {
          '@context': 'https://schema.org',
          '@graph': [
            {
              '@type': 'TechArticle',
              'headline': note.title,
              'description': note.summary || note.lead,
              'datePublished': note.publishedDate,
              'dateModified': note.updatedDate,
              'inLanguage': 'en-US',
              'url': canonicalUrl,
              'author': {
                '@type': 'Person',
                'name': 'Jawed Imtiaz',
                'url': 'https://jawed.co.in/'
              },
              'publisher': {
                '@type': 'Person',
                'name': 'Jawed Imtiaz',
                'url': 'https://jawed.co.in/'
              }
            },
            {
              '@type': 'BreadcrumbList',
              'itemListElement': [
                {
                  '@type': 'ListItem',
                  'position': 1,
                  'name': 'Home',
                  'item': 'https://jawed.co.in/'
                },
                {
                  '@type': 'ListItem',
                  'position': 2,
                  'name': 'Notes',
                  'item': 'https://jawed.co.in/notes/'
                },
                {
                  '@type': 'ListItem',
                  'position': 3,
                  'name': note.title,
                  'item': canonicalUrl
                }
              ]
            }
          ]
        };
      }
    } else if (cleanPath.startsWith('/tools/')) {
      const slug = cleanPath.replace('/tools/', '');
      const tool = toolsList.find((t) => t.slug === slug);
      if (tool) {
        jsonLdData = {
          '@context': 'https://schema.org',
          '@graph': [
            {
              '@type': 'WebApplication',
              'name': tool.title,
              'description': tool.description,
              'url': canonicalUrl,
              'applicationCategory': 'UtilitiesApplication',
              'operatingSystem': 'Any',
              'browserRequirements': 'Requires modern web browser with JavaScript enabled',
              'inLanguage': 'en-US',
              'offers': {
                '@type': 'Offer',
                'price': '0',
                'priceCurrency': 'USD'
              },
              'author': {
                '@type': 'Person',
                'name': 'Jawed Imtiaz',
                'url': 'https://jawed.co.in/'
              }
            },
            {
              '@type': 'BreadcrumbList',
              'itemListElement': [
                {
                  '@type': 'ListItem',
                  'position': 1,
                  'name': 'Home',
                  'item': 'https://jawed.co.in/'
                },
                {
                  '@type': 'ListItem',
                  'position': 2,
                  'name': 'Tools',
                  'item': 'https://jawed.co.in/tools/'
                },
                {
                  '@type': 'ListItem',
                  'position': 3,
                  'name': tool.title,
                  'item': canonicalUrl
                }
              ]
            },
            ...(tool.faq && tool.faq.length > 0
              ? [
                  {
                    '@type': 'FAQPage',
                    'mainEntity': tool.faq.map((f) => ({
                      '@type': 'Question',
                      'name': f.question,
                      'acceptedAnswer': {
                        '@type': 'Answer',
                        'text': f.answer
                      }
                    }))
                  }
                ]
              : [])
          ]
        };
      }
    } else if (cleanPath.startsWith('/blog/')) {
      const slug = cleanPath.replace('/blog/', '');
      const post = blogPosts.find((p) => p.slug === slug);
      if (post) {
        jsonLdData = {
          '@context': 'https://schema.org',
          '@graph': [
            {
              '@type': 'BlogPosting',
              'headline': post.title,
              'description': post.summary || post.lead,
              'datePublished': post.publishedDate,
              'dateModified': post.updatedDate,
              'inLanguage': 'en-US',
              'url': canonicalUrl,
              'author': {
                '@type': 'Person',
                'name': 'Jawed Imtiaz',
                'url': 'https://jawed.co.in/'
              }
            },
            {
              '@type': 'BreadcrumbList',
              'itemListElement': [
                {
                  '@type': 'ListItem',
                  'position': 1,
                  'name': 'Home',
                  'item': 'https://jawed.co.in/'
                },
                {
                  '@type': 'ListItem',
                  'position': 2,
                  'name': 'Blog',
                  'item': 'https://jawed.co.in/blog/'
                },
                {
                  '@type': 'ListItem',
                  'position': 3,
                  'name': post.title,
                  'item': canonicalUrl
                }
              ]
            }
          ]
        };
      }
    } else if (cleanPath === '/contact') {
      jsonLdData = {
        '@context': 'https://schema.org',
        '@type': 'ContactPage',
        'name': title,
        'description': description,
        'url': canonicalUrl
      };
    } else {
      jsonLdData = {
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        'name': title,
        'description': description,
        'url': canonicalUrl
      };
    }

    let scriptTag = document.querySelector('script[type="application/ld+json"]');
    if (jsonLdData) {
      if (!scriptTag) {
        scriptTag = document.createElement('script');
        scriptTag.setAttribute('type', 'application/ld+json');
        document.head.appendChild(scriptTag);
      }
      scriptTag.textContent = JSON.stringify(jsonLdData);
    } else {
      scriptTag?.remove();
    }
  }, [pathname]);

  return null;
};
