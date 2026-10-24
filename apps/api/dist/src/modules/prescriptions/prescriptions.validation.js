"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updatePrescriptionSchema = exports.createPrescriptionSchema = void 0;
const zod_1 = require("zod");
exports.createPrescriptionSchema = zod_1.z.object({
    branchId: zod_1.z.string().min(1),
    customerId: zod_1.z.string().min(1),
    doctorId: zod_1.z.string().optional(),
    prescriptionDate: zod_1.z.coerce.date().optional(),
    prescriptionNumber: zod_1.z.string().optional(),
    imageUrl: zod_1.z.string().optional(),
    notes: zod_1.z.string().optional(),
    items: zod_1.z
        .array(zod_1.z.object({
        productId: zod_1.z.string().optional(),
        medicineName: zod_1.z.string().min(1),
        dose: zod_1.z.string().optional(),
        frequency: zod_1.z.string().optional(),
        duration: zod_1.z.string().optional(),
        instructions: zod_1.z.string().optional(),
    }))
        .default([]),
});
exports.updatePrescriptionSchema = exports.createPrescriptionSchema.partial().extend({
    customerId: zod_1.z.string().min(1).optional(),
});
