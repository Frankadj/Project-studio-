import { doc, getDoc, setDoc, getDocs, collection } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "./firebase";

export type PortfolioTransaction = {
  id: string;
  symbol: string;
  type: "buy" | "sell";
  shares: number;
  price: number;
  total: number;
  timestamp: number;
  realizedPnl?: number;
  averageCostPerShare?: number;
  remainingSharesAfter?: number;
};

const PORTFOLIOS_PATH = "portfolios";

/**
 * Saves a user portfolio metadata (cash, watchlist, and custom properties) to Firestore.
 */
export async function savePortfolioToFirestore(portfolioId: string, cash: number, watchlist: string[]) {
  const path = `${PORTFOLIOS_PATH}/${portfolioId}`;
  try {
    const docRef = doc(db, PORTFOLIOS_PATH, portfolioId);
    await setDoc(docRef, {
      cash,
      watchlist,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

/**
 * Saves an individual trade transaction to the user's transaction history in Firestore.
 */
export async function saveTransactionToFirestore(portfolioId: string, tx: PortfolioTransaction) {
  const path = `${PORTFOLIOS_PATH}/${portfolioId}/transactions/${tx.id}`;
  try {
    const txDocRef = doc(db, PORTFOLIOS_PATH, portfolioId, "transactions", tx.id);
    await setDoc(txDocRef, {
      id: tx.id,
      symbol: tx.symbol.toUpperCase(),
      type: tx.type,
      shares: tx.shares,
      price: tx.price,
      total: tx.total,
      timestamp: tx.timestamp,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

/**
 * Loads both portfolio metadata and transactions from Firestore.
 */
export async function loadPortfolioFromFirestore(portfolioId: string): Promise<{
  cash: number;
  watchlist: string[];
  transactions: PortfolioTransaction[];
} | null> {
  const path = `${PORTFOLIOS_PATH}/${portfolioId}`;
  try {
    const docRef = doc(db, PORTFOLIOS_PATH, portfolioId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      return null;
    }

    const data = docSnap.data();
    const cash = typeof data.cash === "number" ? data.cash : 100000.0;
    const watchlist = Array.isArray(data.watchlist) ? data.watchlist : [];

    // Load transactions from subcollection
    const txsColRef = collection(db, PORTFOLIOS_PATH, portfolioId, "transactions");
    const txsSnap = await getDocs(txsColRef);
    const transactions: PortfolioTransaction[] = [];

    txsSnap.forEach((txDoc) => {
      const txData = txDoc.data();
      transactions.push({
        id: txDoc.id,
        symbol: String(txData.symbol || "").toUpperCase(),
        type: txData.type === "sell" ? "sell" : "buy",
        shares: Number(txData.shares || 0),
        price: Number(txData.price || 0),
        total: Number(txData.total || 0),
        timestamp: Number(txData.timestamp || Date.now()),
      });
    });

    // Sort by timestamp descending
    transactions.sort((a, b) => b.timestamp - a.timestamp);

    return {
      cash,
      watchlist,
      transactions,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
    return null;
  }
}

/**
 * Migrates client data from an anonymous clientId to a Google authenticated userId
 */
export async function migratePortfolio(fromId: string, toId: string) {
  try {
    const localData = await loadPortfolioFromFirestore(fromId);
    if (!localData) return;

    // Save to the destination authenticated profile
    await savePortfolioToFirestore(toId, localData.cash, localData.watchlist);
    for (const tx of localData.transactions) {
      await saveTransactionToFirestore(toId, tx);
    }
  } catch (error) {
    console.error("Migration to Firebase authenticated user failed:", error);
  }
}
