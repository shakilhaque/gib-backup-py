import client from "./client";

export const getLogs       = (params = {}) => client.get("/logs",           { params }).then((r) => r.data);
export const getLogDates   = ()            => client.get("/logs/dates"              ).then((r) => r.data);
export const getDashboardStats = ()        => client.get("/logs/dashboard"          ).then((r) => r.data);
export const countLogs     = (params = {}) => client.get("/logs/count",      { params }).then((r) => r.data);
export const clearLogs     = (params = {}) => client.delete("/logs/clear",   { params }).then((r) => r.data);
export const deleteLog     = (id)          => client.delete(`/logs/${id}`);
