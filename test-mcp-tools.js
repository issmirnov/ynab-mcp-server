#!/usr/bin/env node

import ListBudgetsTool from './dist/tools/ListBudgetsTool.js';
import BudgetSummaryTool from './dist/tools/BudgetSummaryTool.js';
import GetUnapprovedTransactionsTool from './dist/tools/GetUnapprovedTransactionsTool.js';

// Set environment variables
process.env.YNAB_API_TOKEN = 'NYRpA9IlRFOzHZsZosiFiCPt0oXeVWDr1wXb0mvXuUM';
process.env.YNAB_BUDGET_ID = '7fc584d0-5fa6-4879-91d8-63119186ad85';

async function testMCPTools() {
  try {
    console.log('🧪 Testing MCP Tools with your Smirnov Labs LLC budget...\n');
    
    // Test 1: ListBudgetsTool
    console.log('📋 Test 1: ListBudgetsTool');
    const listBudgetsTool = new ListBudgetsTool();
    const budgetsResult = await listBudgetsTool.execute({});
    const budgets = JSON.parse(budgetsResult.content[0].text);
    
    console.log(`✅ Found ${budgets.length} budgets:`);
    budgets.forEach(budget => {
      console.log(`  - ${budget.name} (ID: ${budget.id})`);
    });
    console.log('');
    
    // Test 2: BudgetSummaryTool
    console.log('📊 Test 2: BudgetSummaryTool');
    const budgetSummaryTool = new BudgetSummaryTool();
    const summaryResult = await budgetSummaryTool.execute({
      budgetId: '7fc584d0-5fa6-4879-91d8-63119186ad85',
      month: 'current'
    });
    const summary = JSON.parse(summaryResult.content[0].text);
    
    console.log(`✅ Budget Summary for ${summary.monthBudget.month}:`);
    console.log(`  - Total Income: $${(summary.monthBudget.income / 1000).toFixed(2)}`);
    console.log(`  - Total Budgeted: $${(summary.monthBudget.budgeted / 1000).toFixed(2)}`);
    console.log(`  - Total Activity: $${(summary.monthBudget.activity / 1000).toFixed(2)}`);
    console.log(`  - To Be Budgeted: $${(summary.monthBudget.to_be_budgeted / 1000).toFixed(2)}`);
    console.log(`  - Age of Money: ${summary.monthBudget.age_of_money} days`);
    
    console.log(`\n  📁 Categories (${summary.monthBudget.categories.length} total):`);
    summary.monthBudget.categories.forEach(category => {
      if (!category.deleted && !category.hidden) {
        const balance = (category.balance / 1000).toFixed(2);
        const budgeted = (category.budgeted / 1000).toFixed(2);
        const activity = (category.activity / 1000).toFixed(2);
        
        let status = '';
        if (category.balance < 0) status = '🔴 Overspent';
        else if (category.balance > 0) status = '🟢 Positive';
        else status = '⚪ Zero';
        
        console.log(`    - ${category.name}: ${status} | Balance: $${balance}, Budgeted: $${budgeted}, Activity: $${activity}`);
      }
    });
    
    console.log(`\n  💳 Accounts (${summary.accounts.length} total):`);
    summary.accounts.forEach(account => {
      const balance = (account.balance / 1000).toFixed(2);
      console.log(`    - ${account.name} (${account.type}): $${balance}`);
    });
    console.log('');
    
    // Test 3: GetUnapprovedTransactionsTool
    console.log('⏳ Test 3: GetUnapprovedTransactionsTool');
    const unapprovedTool = new GetUnapprovedTransactionsTool();
    const unapprovedResult = await unapprovedTool.execute({
      budgetId: '7fc584d0-5fa6-4879-91d8-63119186ad85'
    });
    const unapproved = JSON.parse(unapprovedResult.content[0].text);
    
    console.log(`✅ Found ${unapproved.transaction_count} unapproved transactions:`);
    if (unapproved.transactions.length > 0) {
      unapproved.transactions.forEach(transaction => {
        console.log(`  - ${transaction.date}: ${transaction.payee_name || 'Unknown'} - ${transaction.amount} (${transaction.account_name})`);
        if (transaction.memo) console.log(`    Memo: ${transaction.memo}`);
      });
    } else {
      console.log('  No unapproved transactions found.');
    }
    
    console.log('\n🎉 All MCP tools are working perfectly with your Smirnov Labs LLC budget!');
    console.log('\n📝 Summary:');
    console.log(`  - Budget: ${budgets.find(b => b.id === '7fc584d0-5fa6-4879-91d8-63119186ad85')?.name}`);
    console.log(`  - Categories: ${summary.monthBudget.categories.filter(c => !c.deleted && !c.hidden).length} active categories`);
    console.log(`  - Accounts: ${summary.accounts.length} accounts`);
    console.log(`  - Unapproved Transactions: ${unapproved.transaction_count}`);
    
  } catch (error) {
    console.error('❌ Error testing MCP tools:', error);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  }
}

testMCPTools();
