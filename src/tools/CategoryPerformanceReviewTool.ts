import * as ynab from "ynab";
import { Tool } from "@modelcontextprotocol/sdk/types.js";

interface CategoryPerformanceReviewInput {
  budgetId?: string;
  months?: number;
  includeInsights?: boolean;
  performanceThreshold?: number;
}

interface CategoryPerformance {
  category_id: string;
  category_name: string;
  average_budgeted: number;
  average_budgeted_dollars: number;
  average_spent: number;
  average_spent_dollars: number;
  average_available: number;
  average_available_dollars: number;
  budget_utilization: number;
  overspend_frequency: number;
  underspend_frequency: number;
  performance_score: number;
  performance_rating: 'excellent' | 'good' | 'fair' | 'poor';
  trend: 'improving' | 'declining' | 'stable';
  recommendations: string[];
}

interface PerformanceInsight {
  type: 'excellence' | 'concern' | 'opportunity' | 'trend';
  category: string;
  message: string;
  severity: 'low' | 'medium' | 'high';
  data: any;
}

interface CategoryPerformanceReviewResult {
  review_period: string;
  total_categories_reviewed: number;
  category_performance: CategoryPerformance[];
  insights: PerformanceInsight[];
  summary: {
    average_performance_score: number;
    best_performing_category: string;
    worst_performing_category: string;
    most_overspent_category: string;
    most_underspent_category: string;
    categories_needing_attention: number;
  };
  note: string;
}

export default class CategoryPerformanceReviewTool {
  private api: ynab.API;
  private budgetId: string | undefined;

  constructor() {
    const token = process.env.YNAB_API_TOKEN;
    if (!token) {
      throw new Error("YNAB_API_TOKEN environment variable is required");
    }
    this.api = new ynab.API(token);
    this.budgetId = process.env.YNAB_BUDGET_ID;
  }

  getToolDefinition(): Tool {
    return {
      name: "category_performance_review",
      description: "Review category budget performance over time, analyzing spending patterns, budget utilization, and providing performance ratings and recommendations.",
      inputSchema: {
        type: "object",
        properties: {
          budgetId: {
            type: "string",
            description: "The ID of the budget to analyze (optional, defaults to the budget set in the YNAB_BUDGET_ID environment variable)",
          },
          months: {
            type: "number",
            default: 6,
            description: "Number of months to analyze for performance (default: 6, max: 12)",
          },
          includeInsights: {
            type: "boolean",
            default: true,
            description: "Whether to include AI-generated insights and recommendations",
          },
          performanceThreshold: {
            type: "number",
            default: 0.1,
            description: "Threshold for considering a category as overspent (default: 0.1 = 10% over budget)",
          },
        },
        required: [],
      },
    };
  }

  async execute(input: CategoryPerformanceReviewInput) {
    const budgetId = input.budgetId || this.budgetId;
    if (!budgetId) {
      return {
        content: [
          {
            type: "text",
            text: "No budget ID provided. Please provide a budget ID or set the YNAB_BUDGET_ID environment variable. Use the ListBudgets tool to get a list of available budgets.",
          },
        ],
      };
    }

    const monthsToAnalyze = Math.min(input.months || 6, 12);
    const includeInsights = input.includeInsights !== false;
    const performanceThreshold = input.performanceThreshold || 0.1;

    try {
      console.error(`Reviewing category performance for budget ${budgetId} over ${monthsToAnalyze} months`);
      
      // Get historical budget data
      const endDate = new Date();
      const startDate = new Date();
      startDate.setMonth(endDate.getMonth() - monthsToAnalyze);

      const categoryPerformance: CategoryPerformance[] = [];
      const insights: PerformanceInsight[] = [];

      // Get current categories for reference
      const categoriesResponse = await this.api.categories.getCategories(budgetId);
      const allCategories = categoriesResponse.data.category_groups
        .flatMap(group => group.categories)
        .filter(category => 
          category.deleted === false && 
          category.hidden === false &&
          !category.name.includes("Inflow:") &&
          category.name !== "Uncategorized"
        );

      for (const category of allCategories) {
        try {
          // Get monthly data for this category
          const monthlyData: { 
            month: string; 
            budgeted: number; 
            activity: number; 
            available: number; 
          }[] = [];

          for (let i = 0; i < monthsToAnalyze; i++) {
            const monthDate = new Date();
            monthDate.setMonth(monthDate.getMonth() - i);
            const monthKey = monthDate.toISOString().substring(0, 7) + '-01';

            try {
              const monthBudget = await this.api.months.getBudgetMonth(budgetId, monthKey);
              const monthCategory = monthBudget.data.month.categories.find(
                cat => cat.id === category.id
              );

              if (monthCategory) {
                monthlyData.push({
                  month: monthKey,
                  budgeted: monthCategory.budgeted || 0,
                  activity: monthCategory.activity || 0,
                  available: monthCategory.balance || 0,
                });
              }
            } catch (error) {
              console.error(`Error getting data for month ${monthKey}:`, error);
              // Continue with other months
            }
          }

          if (monthlyData.length === 0) {
            continue; // Skip categories with no data
          }

          // Calculate performance metrics
          const totalBudgeted = monthlyData.reduce((sum, month) => sum + month.budgeted, 0);
          const totalSpent = monthlyData.reduce((sum, month) => sum + Math.abs(month.activity), 0);
          const totalAvailable = monthlyData.reduce((sum, month) => sum + month.available, 0);

          const averageBudgeted = totalBudgeted / monthlyData.length;
          const averageSpent = totalSpent / monthlyData.length;
          const averageAvailable = totalAvailable / monthlyData.length;

          // Calculate budget utilization (spent vs budgeted)
          const budgetUtilization = averageBudgeted > 0 ? averageSpent / averageBudgeted : 0;

          // Count overspend and underspend months
          let overspendMonths = 0;
          let underspendMonths = 0;

          for (const month of monthlyData) {
            const spent = Math.abs(month.activity);
            const budgeted = month.budgeted;
            
            if (budgeted > 0) {
              if (spent > budgeted * (1 + performanceThreshold)) {
                overspendMonths++;
              } else if (spent < budgeted * (1 - performanceThreshold)) {
                underspendMonths++;
              }
            }
          }

          const overspendFrequency = monthlyData.length > 0 ? overspendMonths / monthlyData.length : 0;
          const underspendFrequency = monthlyData.length > 0 ? underspendMonths / monthlyData.length : 0;

          // Calculate performance score (0-100)
          let performanceScore = 100;
          
          // Deduct points for overspending
          performanceScore -= overspendFrequency * 30;
          
          // Deduct points for poor budget utilization
          if (budgetUtilization > 1.1) {
            performanceScore -= 20;
          } else if (budgetUtilization > 1.05) {
            performanceScore -= 10;
          }
          
          // Bonus points for good utilization
          if (budgetUtilization >= 0.9 && budgetUtilization <= 1.0) {
            performanceScore += 10;
          }

          performanceScore = Math.max(0, Math.min(100, performanceScore));

          // Determine performance rating
          let performanceRating: 'excellent' | 'good' | 'fair' | 'poor';
          if (performanceScore >= 90) {
            performanceRating = 'excellent';
          } else if (performanceScore >= 75) {
            performanceRating = 'good';
          } else if (performanceScore >= 60) {
            performanceRating = 'fair';
          } else {
            performanceRating = 'poor';
          }

          // Determine trend (simplified - compare first half vs second half)
          let trend: 'improving' | 'declining' | 'stable' = 'stable';
          if (monthlyData.length >= 4) {
            const firstHalf = monthlyData.slice(0, Math.floor(monthlyData.length / 2));
            const secondHalf = monthlyData.slice(Math.floor(monthlyData.length / 2));
            
            const firstHalfAvg = firstHalf.reduce((sum, month) => sum + Math.abs(month.activity), 0) / firstHalf.length;
            const secondHalfAvg = secondHalf.reduce((sum, month) => sum + Math.abs(month.activity), 0) / secondHalf.length;
            
            const change = (secondHalfAvg - firstHalfAvg) / firstHalfAvg;
            
            if (change > 0.1) {
              trend = 'declining';
            } else if (change < -0.1) {
              trend = 'improving';
            }
          }

          // Generate recommendations
          const recommendations: string[] = [];
          
          if (overspendFrequency > 0.3) {
            recommendations.push("Consider increasing budget allocation or reducing spending");
          }
          
          if (budgetUtilization < 0.7) {
            recommendations.push("Budget may be too high - consider reallocating funds");
          }
          
          if (trend === 'declining') {
            recommendations.push("Spending trend is increasing - review recent transactions");
          }
          
          if (performanceScore < 60) {
            recommendations.push("Overall performance needs improvement - review spending patterns");
          }

          categoryPerformance.push({
            category_id: category.id,
            category_name: category.name,
            average_budgeted: averageBudgeted,
            average_budgeted_dollars: Math.round(averageBudgeted / 1000 * 100) / 100,
            average_spent: averageSpent,
            average_spent_dollars: Math.round(averageSpent / 1000 * 100) / 100,
            average_available: averageAvailable,
            average_available_dollars: Math.round(averageAvailable / 1000 * 100) / 100,
            budget_utilization: Math.round(budgetUtilization * 100) / 100,
            overspend_frequency: Math.round(overspendFrequency * 100) / 100,
            underspend_frequency: Math.round(underspendFrequency * 100) / 100,
            performance_score: Math.round(performanceScore * 100) / 100,
            performance_rating: performanceRating,
            trend: trend,
            recommendations: recommendations,
          });

          // Generate insights if requested
          if (includeInsights) {
            // Excellent performance
            if (performanceRating === 'excellent') {
              insights.push({
                type: 'excellence',
                category: category.name,
                message: `Excellent budget performance: ${performanceScore.toFixed(1)}/100 score with consistent spending control`,
                severity: 'low',
                data: { performance_score: performanceScore, rating: performanceRating }
              });
            }

            // Poor performance
            if (performanceRating === 'poor') {
              insights.push({
                type: 'concern',
                category: category.name,
                message: `Poor budget performance: ${performanceScore.toFixed(1)}/100 score with frequent overspending`,
                severity: 'high',
                data: { performance_score: performanceScore, overspend_frequency: overspendFrequency }
              });
            }

            // High overspend frequency
            if (overspendFrequency > 0.5) {
              insights.push({
                type: 'concern',
                category: category.name,
                message: `Frequently overspent: ${(overspendFrequency * 100).toFixed(0)}% of months over budget`,
                severity: 'medium',
                data: { overspend_frequency: overspendFrequency }
              });
            }

            // Declining trend
            if (trend === 'declining') {
              insights.push({
                type: 'trend',
                category: category.name,
                message: `Spending trend is increasing over time - review recent changes`,
                severity: 'medium',
                data: { trend: trend }
              });
            }
          }

        } catch (error) {
          console.error(`Error analyzing category ${category.name}:`, error);
          // Continue with other categories
        }
      }

      // Sort by performance score (best first)
      categoryPerformance.sort((a, b) => b.performance_score - a.performance_score);

      // Calculate summary statistics
      const averagePerformanceScore = categoryPerformance.length > 0 ? 
        categoryPerformance.reduce((sum, cat) => sum + cat.performance_score, 0) / categoryPerformance.length : 0;
      
      const bestPerformingCategory = categoryPerformance[0]?.category_name || 'None';
      const worstPerformingCategory = categoryPerformance[categoryPerformance.length - 1]?.category_name || 'None';
      
      const mostOverspentCategory = categoryPerformance.reduce((max, cat) => 
        cat.overspend_frequency > max.overspend_frequency ? cat : max, 
        categoryPerformance[0] || { overspend_frequency: 0, category_name: 'None' });
      
      const mostUnderspentCategory = categoryPerformance.reduce((max, cat) => 
        cat.underspend_frequency > max.underspend_frequency ? cat : max, 
        categoryPerformance[0] || { underspend_frequency: 0, category_name: 'None' });
      
      const categoriesNeedingAttention = categoryPerformance.filter(cat => cat.performance_rating === 'poor').length;

      const result: CategoryPerformanceReviewResult = {
        review_period: `${monthsToAnalyze} months ending ${endDate.toISOString().substring(0, 7)}`,
        total_categories_reviewed: categoryPerformance.length,
        category_performance: categoryPerformance,
        insights: insights,
        summary: {
          average_performance_score: Math.round(averagePerformanceScore * 100) / 100,
          best_performing_category: bestPerformingCategory,
          worst_performing_category: worstPerformingCategory,
          most_overspent_category: mostOverspentCategory.category_name,
          most_underspent_category: mostUnderspentCategory.category_name,
          categories_needing_attention: categoriesNeedingAttention,
        },
        note: "All amounts are in dollars. Performance score (0-100) based on budget adherence, utilization, and consistency. Budget utilization = average spent / average budgeted. Overspend frequency = percentage of months over budget.",
      };

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text",
            text: `Error reviewing category performance: ${errorMessage}`,
          },
        ],
      };
    }
  }
}
