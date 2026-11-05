export const uid = (prefix: string = 'id'): string => {
  const timestamp = Date.now().toString(36);
  const random = Math.floor(Math.random() * 9000 + 1000);
  return `${prefix}_${timestamp}_${random}`;
};

export const now = (): string => new Date().toISOString();

export const today = (): string => new Date().toISOString().slice(0, 10);
