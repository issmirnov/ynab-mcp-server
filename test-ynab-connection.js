#!/usr/bin/env node

import * as ynab from 'ynab';

const YNAB_API_TOKEN = 'NYRpA9IlRFOzHZsZosiFiCPt0oXeVWDr1wXb0mvXuUM';
const BUDGET_ID = '7fc584d0-5fa6-4879-91d8-63119186ad85';

async function testYNABConnection() {
  try {
    console.log('🔗 Testing YNAB API connection...');
    
    const api = new ynab.API(YNAB_API_TOKEN);
    
    // Test 1: List budgets to verify connection
    console.log('\n📋 Step 1: Listing available budgets...');
    const budgetsResponse = await api.budgets.getBudgets();
    const budgets = budgetsResponse.data.budgets;
    
    console.log(`✅ Found ${budgets.length} budgets:`);
    budgets.forEach(budget => {
      console.log(`  - ${budget.name} (ID: ${budget.id})`);
      if (budget.id === BUDGET_ID) {
        console.log(`    🎯 This is your "Smirnov Labs LLC" budget!`);
      }
    });
    
    // Test 2: Get budget details for Smirnov Labs LLC
    console.log('\n🏢 Step 2: Getting budget details for Smirnov Labs LLC...');
    const budgetResponse = await api.budgets.getBudgetById(BUDGET_ID);
    const budget = budgetResponse.data.budget;
    
    console.log(`✅ Budget Details:`);
    console.log(`  - Name: ${budget.name}`);
    console.log(`  - Last Modified: ${budget.last_modified_on}`);
    console.log(`  - Currency: ${budget.currency_format.currency_symbol}`);
    
    // Test 3: Get categories for the budget
    console.log('\n📊 Step 3: Getting categories for Smirnov Labs LLC budget...');
    const categoriesResponse = await api.categories.getCategories(BUDGET_ID);
    const categories = categoriesResponse.data.category_groups;
    
    console.log(`✅ Found ${categories.length} category groups:`);
    categories.forEach(group => {
      if (!group.deleted && !group.hidden) {
        console.log(`\n  📁 ${group.name}:`);
        if (group.categories) {
          group.categories.forEach(category => {
            if (!category.deleted && !category.hidden) {
              const balance = (category.balance / 1000).toFixed(2);
              const budgeted = (category.budgeted / 1000).toFixed(2);
              const activity = (category.activity / 1000).toFixed(2);
              console.log(`    - ${category.name}: Balance: ${balance}, Budgeted: ${budgeted}, Activity: ${activity}`);
            }
          });
        }
      }
    });
    
    // Test 4: Get accounts for the budget
    console.log('\n💳 Step 4: Getting accounts for Smirnov Labs LLC budget...');
    const accountsResponse = await api.accounts.getAccounts(BUDGET_ID);
    const accounts = accountsResponse.data.accounts;
    
    console.log(`✅ Found ${accounts.length} accounts:`);
    accounts.forEach(account => {
      if (!account.deleted && !account.closed) {
        const balance = (account.balance / 1000).toFixed(2);
        console.log(`  - ${account.name} (${account.type}): ${balance} ${budget.currency_format.currency_symbol}`);
      }
    });
    
    console.log('\n🎉 All tests completed successfully! The MCP server should work perfectly with your YNAB data.');
    
  } catch (error) {
    console.error('❌ Error testing YNAB connection:', error);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  }
}

testYNABConnection();
