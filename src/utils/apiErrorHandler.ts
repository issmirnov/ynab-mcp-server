import * as ynab from "ynab";

export interface APIErrorInfo {
  isRateLimited: boolean;
  isAuthError: boolean;
  isNetworkError: boolean;
  isServerError: boolean;
  retryAfter?: number; // seconds
  userMessage: string;
  technicalMessage: string;
}

export function analyzeAPIError(error: any): APIErrorInfo {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorString = errorMessage.toLowerCase();

  // Check for rate limiting
  if (errorString.includes('too_many_requests') || 
      errorString.includes('rate limit') ||
      errorString.includes('429') ||
      errorString.includes('quota exceeded')) {
    
    // Try to extract retry-after header if available
    let retryAfter: number | undefined;
    if (error.response?.headers?.['retry-after']) {
      retryAfter = parseInt(error.response.headers['retry-after']);
    }

    return {
      isRateLimited: true,
      isAuthError: false,
      isNetworkError: false,
      isServerError: false,
      retryAfter,
      userMessage: `YNAB API rate limit reached. You can make 200 requests per hour. ${retryAfter ? `Please wait ${retryAfter} seconds before trying again.` : 'Please wait a few minutes before trying again.'}`,
      technicalMessage: `Rate limit exceeded: ${errorMessage}`
    };
  }

  // Check for authentication errors
  if (errorString.includes('unauthorized') || 
      errorString.includes('401') ||
      errorString.includes('invalid token') ||
      errorString.includes('authentication failed')) {
    return {
      isRateLimited: false,
      isAuthError: true,
      isNetworkError: false,
      isServerError: false,
      userMessage: 'YNAB API authentication failed. Please check your API token and ensure it\'s valid.',
      technicalMessage: `Authentication error: ${errorMessage}`
    };
  }

  // Check for YNAB's anti-bot protection HTML response (check this first!)
  if ((errorString.includes('not allowed') && errorString.includes('abnormal traffic')) ||
      (errorString.includes('we\'ve detected some abnormal traffic') && errorString.includes('ynab')) ||
      (errorString.includes('help@ynab.com') && errorString.includes('abnormal traffic')) ||
      (errorString.includes('abnormal traffic') && errorString.includes('help@ynab.com'))) {
    return {
      isRateLimited: false,
      isAuthError: false,
      isNetworkError: false,
      isServerError: true,
      userMessage: 'YNAB has temporarily blocked API access due to detected unusual activity. This is an anti-bot protection measure. Please wait 15-30 minutes before trying again, or contact YNAB support at help@ynab.com if the issue persists.',
      technicalMessage: `YNAB anti-bot protection triggered: ${errorMessage.substring(0, 200)}...`
    };
  }

  // Check for network/connection errors
  if (errorString.includes('network') || 
      errorString.includes('connection') ||
      errorString.includes('timeout') ||
      errorString.includes('econnreset') ||
      errorString.includes('enotfound')) {
    return {
      isRateLimited: false,
      isAuthError: false,
      isNetworkError: true,
      isServerError: false,
      userMessage: 'Network connection error. Please check your internet connection and try again.',
      technicalMessage: `Network error: ${errorMessage}`
    };
  }

  // Check for server errors
  if (errorString.includes('500') || 
      errorString.includes('502') ||
      errorString.includes('503') ||
      errorString.includes('504') ||
      errorString.includes('internal server error')) {
    return {
      isRateLimited: false,
      isAuthError: false,
      isNetworkError: false,
      isServerError: true,
      userMessage: 'YNAB API server error. Please try again in a few minutes.',
      technicalMessage: `Server error: ${errorMessage}`
    };
  }

  // Check for HTML response (often indicates API issues)
  if (errorString.includes('<html') || 
      errorString.includes('<style') ||
      errorString.includes('<!doctype')) {
    return {
      isRateLimited: false,
      isAuthError: false,
      isNetworkError: false,
      isServerError: true,
      userMessage: 'YNAB API returned an unexpected response. This may indicate a temporary service issue. Please try again in a few minutes.',
      technicalMessage: `Unexpected HTML response: ${errorMessage.substring(0, 200)}...`
    };
  }

  // Generic error
  return {
    isRateLimited: false,
    isAuthError: false,
    isNetworkError: false,
    isServerError: false,
    userMessage: 'An unexpected error occurred while communicating with the YNAB API. Please try again.',
    technicalMessage: `Unexpected error: ${errorMessage}`
  };
}

export async function handleAPIError(error: any, context: string = 'API call'): Promise<never> {
  const errorInfo = analyzeAPIError(error);
  
  // Log the technical details for debugging
  console.error(`[${context}] ${errorInfo.technicalMessage}`);
  
  // Throw a user-friendly error message
  throw new Error(`${context} failed: ${errorInfo.userMessage}`);
}

export function createRetryableAPICall<T>(
  apiCall: () => Promise<T>,
  context: string = 'API call',
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  return new Promise(async (resolve, reject) => {
    let lastError: any;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await apiCall();
        resolve(result);
        return;
      } catch (error) {
        lastError = error;
        const errorInfo = analyzeAPIError(error);
        
        // Don't retry on auth errors, rate limits (unless we have retry-after), or anti-bot protection
        if (errorInfo.isAuthError) {
          reject(error);
          return;
        }
        
        if (errorInfo.isRateLimited && !errorInfo.retryAfter) {
          reject(error);
          return;
        }
        
        // Don't retry on anti-bot protection - it will make the situation worse
        if (errorInfo.userMessage.includes('anti-bot protection') || 
            errorInfo.userMessage.includes('abnormal traffic')) {
          reject(error);
          return;
        }
        
        // Don't retry on the last attempt
        if (attempt === maxRetries) {
          reject(error);
          return;
        }
        
        // Calculate delay
        let delay = baseDelay * Math.pow(2, attempt - 1); // Exponential backoff
        if (errorInfo.retryAfter) {
          delay = errorInfo.retryAfter * 1000; // Convert to milliseconds
        }
        
        console.log(`[${context}] Attempt ${attempt} failed, retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    reject(lastError);
  });
}
