import client from "./client";

export const runBackup = (data) =>
  client.post("/backup/run", data).then((r) => r.data);

export const scheduleBackup = (data) =>
  client.post("/backup/schedule", data).then((r) => r.data);

export const getSchedules = () =>
  client.get("/backup/schedules").then((r) => r.data);

export const deleteSchedule = (id) =>
  client.delete(`/backup/schedules/${id}`);

export const toggleSchedule = (id) =>
  client.patch(`/backup/schedules/${id}/toggle`).then((r) => r.data);

export const downloadBackup = (logId) =>
  client.get(`/backup/download/${logId}`, { responseType: "blob" }).then((r) => r.data);
