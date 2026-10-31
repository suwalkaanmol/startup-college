// Public reference data: tag groups, office hubs, settings the UI needs.
import { Router } from 'express';
import { config } from '../config.js';
import { query } from '../db.js';
import { wrap } from '../lib/http.js';
import { TAG_GROUPS } from '../lib/tags.js';
import { MAX_GROUP_SIZE, MAX_SLOTS } from '../lib/social.js';

const COMPANIES = ['TCS', 'Infosys', 'Wipro', 'Cognizant', 'Accenture', 'Capgemini', 'HCLTech', 'Tech Mahindra', 'Amazon',
  'Microsoft', 'Google', 'Deloitte', 'Zoho', 'Oracle', 'IBM', 'Samsung', 'Goldman Sachs', 'JP Morgan', 'Salesforce', 'Adobe'];

export default Router().get('/', wrap(async (_req, res) => {
  const hubs = (await query('SELECT id,city,area,lat,lng FROM hubs ORDER BY city,area')).rows;
  res.json({ tagGroups: TAG_GROUPS, hubs, companies: COMPANIES, emailDomain: config.emailDomain, creditsPerBooking: config.creditsPerBooking, maxGroupSize: MAX_GROUP_SIZE, maxSlots: MAX_SLOTS });
}));
