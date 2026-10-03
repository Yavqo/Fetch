export const isInformational = (status: number): boolean => status >= 100 && status < 200;
export const isSuccess = (status: number): boolean => status >= 200 && status < 300;
export const isRedirect = (status: number): boolean => status >= 300 && status < 400;
export const isClientError = (status: number): boolean => status >= 400 && status < 500;
export const isServerError = (status: number): boolean => status >= 500 && status < 600;
