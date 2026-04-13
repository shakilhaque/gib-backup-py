import client from "./client";

export const getDevices = (params = {}) =>
  client.get("/devices", { params }).then((r) => r.data);

export const getGroups = () =>
  client.get("/devices/groups").then((r) => r.data);

export const createDevice = (data) =>
  client.post("/devices", data).then((r) => r.data);

export const updateDevice = (id, data) =>
  client.put(`/devices/${id}`, data).then((r) => r.data);

export const deleteDevice = (id) =>
  client.delete(`/devices/${id}`);

export const bulkCreateDevices = (devices) =>
  client.post("/devices/bulk", { devices }).then((r) => r.data);
