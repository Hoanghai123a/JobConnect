import { pb } from "./pocketbase";
import { escapePb } from "./pocketbase-utils";
import { createStaffActionLog } from "./audit-staff";
import { withQueryTracking } from "./coin-query-monitor";
import {
  classifyError,
  getUserMessage,
  InsufficientBalanceError,
  ValidationError,
} from "./errors/coin-errors";
import { coinLogger, OperationLogger } from "./logger/coin-logger";
import { withRetry } from "./retry/retry-logic";

/**
 * Retry configuration for coin operations
 * Tune these values based on production metrics
 */
const COIN_OPERATION_RETRY_CONFIG = {
  maxAttempts: 3,
  baseDelay: 100,
  maxDelay: 5000,
};

export interface CoinTransaction {
  id: string;
  user: string;
  amount: number;
  balance_after: number;
  transaction_type:
    | "admin_add"
    | "admin_subtract"
    | "referral"
    | "checkin"
    | "reward"
    | "exchange"
    | "game";
  reason?: string;
  admin_id?: string;
  metadata?: Record<string, any>;
  created: string;
  updated: string;
  expand?: {
    user?: {
      id: string;
      full_name: string;
      username: string;
      avatar?: string;
    };
    admin_id?: {
      id: string;
      full_name: string;
      username: string;
    };
  };
}

export interface GardenBalance {
  id: string;
  user: string;
  coins: number;
  reserve_balance: number;
  referral_coins_total?: number;
  checkin_coins_total?: number;
  created?: string;
  updated?: string;
}

export interface AddCoinsParams {
  userId: string;
  amount: number;
  reason: string;
  adminId: string;
}

export interface SubtractCoinsParams {
  userId: string;
  amount: number;
  reason: string;
  adminId: string;
}

/**
 * Lấy thông tin số xu hiện tại của user
 *
 * Performance: With index on 'user' field, this query runs in ~1-2ms
 * Without index: ~50-100ms (50x slower)
 */
export async function getUserCoinBalance(
  userId: string
): Promise<GardenBalance | null> {
  return withQueryTracking('getUserCoinBalance', async () => {
    try {
      const balance = await pb
        .collection("garden_balances")
        .getFirstListItem<GardenBalance>(`user = "${escapePb(userId)}"`);
      return balance;
    } catch (error) {
      coinLogger.error('get_balance_failed', { userId }, error);
      return null;
    }
  });
}

/**
 * Cộng xu cho user với audit logging
 *
 * Enhanced với:
 * - Structured logging
 * - Error classification
 * - Automatic retry for transient errors
 * - Operation tracking
 */
export async function addCoinsToUser(
  params: AddCoinsParams
): Promise<{ success: boolean; message: string; newBalance?: number }> {
  const { userId, amount, reason, adminId } = params;
  const operationId = `add_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const startTime = performance.now();
  const opLogger = new OperationLogger('addCoins', {
    operationId,
    userId,
    amount,
    adminId,
  });

  opLogger.start();

  // Validation
  if (amount <= 0) {
    const error = new ValidationError('amount', 'phải lớn hơn 0', amount);
    opLogger.warn('Validation failed', { error: error.code });
    return { success: false, message: error.userMessage || error.message };
  }

  if (!reason.trim()) {
    const error = new ValidationError('reason', 'không được để trống');
    opLogger.warn('Validation failed', { error: error.code });
    return { success: false, message: error.userMessage || error.message };
  }

  try {
    // Wrap entire operation với retry logic
    const result = await withRetry(
      async () => {
        // Lấy hoặc tạo balance
        let balance = await getUserCoinBalance(userId);

        if (!balance) {
          opLogger.debug('Creating new balance record');

          balance = await pb.collection("garden_balances").create<GardenBalance>({
            user: userId,
            coins: 0,
            reserve_balance: 0,
            referral_coins_total: 0,
            checkin_coins_total: 0,
          });

          coinLogger.info('balance_created', {
            operationId,
            userId,
            balanceId: balance.id,
          });
        }

        const oldBalance = balance.coins;
        const newBalance = oldBalance + amount;

        opLogger.debug('Updating balance', { oldBalance, newBalance });

        // Update balance
        await pb.collection("garden_balances").update(balance.id, {
          coins: newBalance,
        });

        coinLogger.info('balance_updated', {
          operationId,
          balanceId: balance.id,
          oldBalance,
          newBalance,
        });

        // Tạo transaction record
        const txRecord = await pb.collection("coin_transactions").create({
          user: userId,
          amount: amount,
          balance_after: newBalance,
          transaction_type: "admin_add",
          reason: reason.trim(),
          admin_id: adminId,
        });

        coinLogger.info('transaction_logged', {
          operationId,
          transactionId: txRecord.id,
        });

        // Ghi audit log (non-critical)
        try {
          await createStaffActionLog({
            staff_id: adminId,
            action: "add_coins",
            target_type: "user_coins",
            target_id: userId,
            details: {
              amount,
              reason: reason.trim(),
              balance_before: oldBalance,
              balance_after: newBalance,
            },
          });

          coinLogger.info('audit_logged', { operationId });
        } catch (auditError) {
          // Log but don't fail operation
          coinLogger.warn('audit_log_failed', {
            operationId,
            error: auditError,
            note: 'Balance updated successfully, audit log skipped',
          });
        }

        return { newBalance };
      },
      {
        maxAttempts: COIN_OPERATION_RETRY_CONFIG.maxAttempts,
        baseDelay: COIN_OPERATION_RETRY_CONFIG.baseDelay,
        maxDelay: COIN_OPERATION_RETRY_CONFIG.maxDelay,
        shouldRetry: (error, attempt) => {
          const classified = classifyError(error, {
            operation: 'addCoins',
            userId,
            attempt,
          });

          opLogger.warn(`Retry attempt ${attempt}`, {
            errorCode: classified.code,
            retryable: classified.retryable,
          });

          return classified.retryable;
        },
        onRetry: (error, attempt) => {
          opLogger.debug(`Retrying`, { attempt, nextAttempt: attempt + 1 });
        },
      }
    );

    const duration = performance.now() - startTime;

    opLogger.success({
      newBalance: result.newBalance,
      durationMs: Math.round(duration),
    });

    return {
      success: true,
      message: `Đã cộng ${amount.toLocaleString()} xu thành công`,
      newBalance: result.newBalance,
    };
  } catch (error: any) {
    const duration = performance.now() - startTime;
    const classified = classifyError(error, {
      operation: 'addCoins',
      userId,
    });

    opLogger.error(classified);

    coinLogger.error(
      'coin_operation_failed',
      {
        operationId,
        operation: 'addCoins',
        userId,
        amount,
        adminId,
        durationMs: Math.round(duration),
        errorCode: classified.code,
        errorMessage: classified.message,
        details: classified.details,
      },
      error
    );

    return {
      success: false,
      message: getUserMessage(classified),
    };
  }
}

/**
 * Trừ xu của user với audit logging
 *
 * Enhanced với:
 * - Balance validation
 * - Structured logging
 * - Error classification
 * - Automatic retry for transient errors
 */
export async function subtractCoinsFromUser(
  params: SubtractCoinsParams
): Promise<{ success: boolean; message: string; newBalance?: number }> {
  const { userId, amount, reason, adminId } = params;
  const operationId = `subtract_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const startTime = performance.now();
  const opLogger = new OperationLogger('subtractCoins', {
    operationId,
    userId,
    amount,
    adminId,
  });

  opLogger.start();

  // Validation
  if (amount <= 0) {
    const error = new ValidationError('amount', 'phải lớn hơn 0', amount);
    opLogger.warn('Validation failed', { error: error.code });
    return { success: false, message: error.userMessage || error.message };
  }

  if (!reason.trim()) {
    const error = new ValidationError('reason', 'không được để trống');
    opLogger.warn('Validation failed', { error: error.code });
    return { success: false, message: error.userMessage || error.message };
  }

  try {
    // Wrap với retry logic
    const result = await withRetry(
      async () => {
        // Lấy balance hiện tại
        const balance = await getUserCoinBalance(userId);

        if (!balance) {
          throw new InsufficientBalanceError(0, amount);
        }

        const oldBalance = balance.coins;

        // Check sufficient balance
        if (oldBalance < amount) {
          throw new InsufficientBalanceError(oldBalance, amount);
        }

        const newBalance = oldBalance - amount;

        opLogger.debug('Updating balance', { oldBalance, newBalance });

        // Update balance
        await pb.collection("garden_balances").update(balance.id, {
          coins: newBalance,
        });

        coinLogger.info('balance_updated', {
          operationId,
          balanceId: balance.id,
          oldBalance,
          newBalance,
        });

        // Tạo transaction record
        const txRecord = await pb.collection("coin_transactions").create({
          user: userId,
          amount: -amount, // Negative amount for subtract
          balance_after: newBalance,
          transaction_type: "admin_subtract",
          reason: reason.trim(),
          admin_id: adminId,
        });

        coinLogger.info('transaction_logged', {
          operationId,
          transactionId: txRecord.id,
        });

        // Ghi audit log (non-critical)
        try {
          await createStaffActionLog({
            staff_id: adminId,
            action: "subtract_coins",
            target_type: "user_coins",
            target_id: userId,
            details: {
              amount,
              reason: reason.trim(),
              balance_before: oldBalance,
              balance_after: newBalance,
            },
          });

          coinLogger.info('audit_logged', { operationId });
        } catch (auditError) {
          coinLogger.warn('audit_log_failed', {
            operationId,
            error: auditError,
            note: 'Balance updated successfully, audit log skipped',
          });
        }

        return { newBalance };
      },
      {
        maxAttempts: COIN_OPERATION_RETRY_CONFIG.maxAttempts,
        baseDelay: COIN_OPERATION_RETRY_CONFIG.baseDelay,
        maxDelay: COIN_OPERATION_RETRY_CONFIG.maxDelay,
        shouldRetry: (error, attempt) => {
          // Don't retry insufficient balance errors
          if (error instanceof InsufficientBalanceError) {
            return false;
          }

          const classified = classifyError(error, {
            operation: 'subtractCoins',
            userId,
            attempt,
          });

          opLogger.warn(`Retry attempt ${attempt}`, {
            errorCode: classified.code,
            retryable: classified.retryable,
          });

          return classified.retryable;
        },
        onRetry: (error, attempt) => {
          opLogger.debug(`Retrying`, { attempt, nextAttempt: attempt + 1 });
        },
      }
    );

    const duration = performance.now() - startTime;

    opLogger.success({
      newBalance: result.newBalance,
      durationMs: Math.round(duration),
    });

    return {
      success: true,
      message: `Đã trừ ${amount.toLocaleString()} xu thành công`,
      newBalance: result.newBalance,
    };
  } catch (error: any) {
    const duration = performance.now() - startTime;
    const classified = classifyError(error, {
      operation: 'subtractCoins',
      userId,
    });

    opLogger.error(classified);

    coinLogger.error(
      'coin_operation_failed',
      {
        operationId,
        operation: 'subtractCoins',
        userId,
        amount,
        adminId,
        durationMs: Math.round(duration),
        errorCode: classified.code,
        errorMessage: classified.message,
        details: classified.details,
      },
      error
    );

    return {
      success: false,
      message: getUserMessage(classified),
    };
  }
}

/**
 * Lấy lịch sử giao dịch xu của user trong N ngày gần đây
 *
 * Performance: With composite index on (user, created), this query runs in ~5-10ms
 * Without index: ~500-1000ms (100x slower)
 */
export async function getCoinTransactionHistory(
  userId: string,
  days: number = 7
): Promise<CoinTransaction[]> {
  return withQueryTracking('getCoinTransactionHistory', async () => {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);
      const cutoffIso = cutoffDate.toISOString();

      const transactions = await pb
        .collection("coin_transactions")
        .getFullList<CoinTransaction>({
          filter: `user = "${escapePb(userId)}" && created >= "${cutoffIso}"`,
          sort: "-created",
          expand: "user,admin_id",
        });

      return transactions;
    } catch (error) {
      coinLogger.error('get_transaction_history_failed', { userId, days }, error);
      return [];
    }
  });
}
