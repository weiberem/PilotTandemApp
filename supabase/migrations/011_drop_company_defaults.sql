-- Remove hardcoded Skywings defaults so new pilots fill in their own company.
-- App still works for existing Skywings pilots; their rows already have values.
alter table pilots alter column primary_company_name drop default;
alter table pilots alter column primary_company_address drop default;
