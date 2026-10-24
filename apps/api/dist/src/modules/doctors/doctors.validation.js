"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateDoctorSchema = exports.createDoctorSchema = void 0;
const zod_1 = require("zod");
exports.createDoctorSchema = zod_1.z.object({
    name: zod_1.z.string().min(2).max(200),
    registrationNumber: zod_1.z.string().optional(),
    specialization: zod_1.z.string().optional(),
    hospitalClinic: zod_1.z.string().optional(),
    phone: zod_1.z.string().optional(),
    email: zod_1.z.string().email().optional(),
    address: zod_1.z.string().optional(),
});
exports.updateDoctorSchema = exports.createDoctorSchema.partial().extend({ isActive: zod_1.z.boolean().optional() });
