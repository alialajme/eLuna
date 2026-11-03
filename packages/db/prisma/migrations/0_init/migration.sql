-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('CUSTOMER', 'VENDOR', 'ADMIN', 'SUPPLIER', 'SUPPORT', 'CALL_CENTER');

-- CreateEnum
CREATE TYPE "MfaMethod" AS ENUM ('SMS', 'TOTP', 'WEBAUTHN');

-- CreateEnum
CREATE TYPE "VendorStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'REJECTED');

-- CreateEnum
CREATE TYPE "SupplierStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'REJECTED');

-- CreateEnum
CREATE TYPE "MaterialStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "MaterialUnit" AS ENUM ('METER', 'YARD', 'ROLL', 'PIECE', 'SPOOL');

-- CreateEnum
CREATE TYPE "MaterialOrderStatus" AS ENUM ('PENDING', 'ACCEPTED', 'SHIPPED', 'COMPLETED', 'CANCELLED', 'REJECTED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "MaterialReturnStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED', 'RECEIVED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "TradeLicenseStatus" AS ENUM ('UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'VOID');

-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "FulfillmentStatus" AS ENUM ('PENDING', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'RETURNED');

-- CreateEnum
CREATE TYPE "ShipmentStatus" AS ENUM ('CREATED', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED', 'RETURNED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CARD', 'LUNA_WALLET', 'TABBY', 'TAMARA', 'CASH_ON_DELIVERY', 'TAP', 'NOQODI', 'NEOPAY');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'AUTHORIZED', 'CAPTURED', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED');

-- CreateEnum
CREATE TYPE "WalletTxnType" AS ENUM ('CREDIT', 'DEBIT', 'REFUND', 'REVERSAL', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "LedgerEntryType" AS ENUM ('SALE', 'COMMISSION', 'REFUND', 'PAYOUT', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "ReturnStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED', 'RECEIVED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "AIAgentType" AS ENUM ('SHOPPING', 'SELLER', 'STUDIO', 'LOGISTICS', 'PAYMENT', 'POS', 'SUPPLIER', 'CASE');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('ORDER_UPDATE', 'PAYMENT_UPDATE', 'PROMOTION', 'AI_SUGGESTION', 'SYSTEM', 'CASE_UPDATE');

-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED');

-- CreateEnum
CREATE TYPE "GarmentStatus" AS ENUM ('UPLOADED', 'QC_PASSED', 'QC_FAILED', 'ANALYZED');

-- CreateEnum
CREATE TYPE "GarmentImageRole" AS ENUM ('FRONT', 'BACK', 'OPEN', 'SLEEVE', 'EMBROIDERY', 'BUTTON', 'FABRIC', 'LOGO', 'COLLAR', 'BELT', 'POCKET', 'DETAIL');

-- CreateEnum
CREATE TYPE "StudioSessionStatus" AS ENUM ('DRAFT', 'RUNNING', 'PREVIEW', 'APPROVED', 'PUBLISHED', 'REVIEW_REQUIRED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "GenerationJobKind" AS ENUM ('ANALYZE', 'IMAGE', 'VIDEO', 'FIDELITY', 'PUBLISH');

-- CreateEnum
CREATE TYPE "GenerationJobState" AS ENUM ('QUEUED', 'VALIDATING', 'ANALYZING', 'GENERATING_IMAGES', 'VALIDATING_IMAGES', 'GENERATING_VIDEO', 'VALIDATING_VIDEO', 'COMPLETED', 'FAILED', 'REVIEW_REQUIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "GeneratedAssetType" AS ENUM ('IMAGE_FRONT', 'IMAGE_BACK', 'IMAGE_34_FRONT', 'IMAGE_34_BACK', 'VIDEO_TURNTABLE');

-- CreateEnum
CREATE TYPE "StudioSubscriptionStatus" AS ENUM ('ACTIVE', 'PAST_DUE', 'CANCELLED', 'TRIALING', 'EXPIRED');

-- CreateEnum
CREATE TYPE "StudioBillingCycle" AS ENUM ('MONTHLY', 'ANNUAL');

-- CreateEnum
CREATE TYPE "CreditTxnType" AS ENUM ('GRANT', 'PURCHASE', 'RESERVE', 'CONSUME', 'RELEASE', 'EXPIRE', 'ADJUST', 'ROLLOVER');

-- CreateEnum
CREATE TYPE "StudioPaymentKind" AS ENUM ('SUBSCRIPTION', 'CREDIT_PACK');

-- CreateEnum
CREATE TYPE "StudioPaymentStatus" AS ENUM ('PENDING', 'CAPTURED', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "CaseType" AS ENUM ('COMPLAINT', 'SUGGESTION', 'QUESTION');

-- CreateEnum
CREATE TYPE "CaseStatus" AS ENUM ('NEW', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'RESOLVED', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CasePriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "CaseChannel" AS ENUM ('WEBSITE', 'MOBILE', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "CaseOpenerRole" AS ENUM ('CUSTOMER', 'VENDOR', 'SUPPLIER');

-- CreateEnum
CREATE TYPE "CaseAuthorRole" AS ENUM ('CUSTOMER', 'VENDOR', 'SUPPLIER', 'SUPPORT', 'CALL_CENTER', 'ADMIN', 'SYSTEM');

-- CreateEnum
CREATE TYPE "CaseTeam" AS ENUM ('SUPPORT', 'CALL_CENTER');

-- CreateEnum
CREATE TYPE "CaseEventType" AS ENUM ('CREATED', 'ASSIGNED', 'STATUS_CHANGED', 'MESSAGE', 'ESCALATED', 'RESOLVED', 'REOPENED', 'CATEGORY_CHANGED', 'PRIORITY_CHANGED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "mfaMethod" "MfaMethod",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "loyaltyPoints" INTEGER NOT NULL DEFAULT 0,
    "walletBalance" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SizeProfile" (
    "id" TEXT NOT NULL,
    "customerProfileId" TEXT NOT NULL,
    "height" DOUBLE PRECISION,
    "weight" DOUBLE PRECISION,
    "bust" DOUBLE PRECISION,
    "waist" DOUBLE PRECISION,
    "hip" DOUBLE PRECISION,
    "shoulder" DOUBLE PRECISION,
    "sleeveLength" TEXT,
    "preferredAbayaLength" TEXT,
    "fitPreference" TEXT,
    "usualSize" TEXT,
    "sizeSystem" TEXT DEFAULT 'INTL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SizeProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vendor" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "storeName" TEXT NOT NULL,
    "storeSlug" TEXT NOT NULL,
    "description" TEXT,
    "logoUrl" TEXT,
    "bannerUrl" TEXT,
    "status" "VendorStatus" NOT NULL DEFAULT 'PENDING',
    "commissionRate" DECIMAL(4,2) NOT NULL DEFAULT 0.15,
    "ibanNumber" TEXT,
    "trn" TEXT,
    "mfaVerifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "companySlug" TEXT NOT NULL,
    "description" TEXT,
    "logoUrl" TEXT,
    "bannerUrl" TEXT,
    "status" "SupplierStatus" NOT NULL DEFAULT 'PENDING',
    "materialTypes" TEXT[],
    "ibanNumber" TEXT,
    "trn" TEXT,
    "mfaVerifiedAt" TIMESTAMP(3),
    "tradeLicenseNumber" TEXT,
    "tradeLicenseStatus" "TradeLicenseStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "tradeLicenseExpiry" TIMESTAMP(3),
    "tradeLicenseVerifiedAt" TIMESTAMP(3),
    "tradeLicenseRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Material" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "materialType" TEXT NOT NULL,
    "color" TEXT,
    "composition" TEXT,
    "unit" "MaterialUnit" NOT NULL,
    "wholesalePrice" DECIMAL(10,2) NOT NULL,
    "moq" INTEGER NOT NULL DEFAULT 1,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT,
    "images" JSONB NOT NULL DEFAULT '[]',
    "status" "MaterialStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Material_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialOrder" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "status" "MaterialOrderStatus" NOT NULL DEFAULT 'PENDING',
    "total" DECIMAL(10,2) NOT NULL,
    "note" TEXT,
    "trackingNote" TEXT,
    "courier" TEXT,
    "trackingNumber" TEXT,
    "externalRef" TEXT,
    "labelUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaterialOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialReturn" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "status" "MaterialReturnStatus" NOT NULL DEFAULT 'REQUESTED',
    "reason" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "refundAmount" DECIMAL(10,2) NOT NULL,
    "isRestocked" BOOLEAN NOT NULL DEFAULT false,
    "resolutionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaterialReturn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialOrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "materialId" TEXT,
    "materialName" TEXT NOT NULL,
    "unit" "MaterialUnit" NOT NULL,
    "unitPrice" DECIMAL(10,2) NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "MaterialOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialInvoice" (
    "id" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "materialOrderId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "supplierName" TEXT NOT NULL,
    "supplierTRN" TEXT NOT NULL,
    "vendorName" TEXT NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'ISSUED',
    "subtotal" DECIMAL(10,2) NOT NULL,
    "vatRate" DECIMAL(4,2) NOT NULL DEFAULT 0.05,
    "vatAmount" DECIMAL(10,2) NOT NULL,
    "total" DECIMAL(10,2) NOT NULL,
    "lines" JSONB NOT NULL,
    "externalRef" TEXT,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaterialInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderInvoice" (
    "id" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "vendorName" TEXT NOT NULL,
    "vendorTRN" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "subtotal" DECIMAL(10,2) NOT NULL,
    "vatRate" DECIMAL(4,2) NOT NULL DEFAULT 0.05,
    "vatAmount" DECIMAL(10,2) NOT NULL,
    "total" DECIMAL(10,2) NOT NULL,
    "lines" JSONB NOT NULL,
    "externalRef" TEXT,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "price" DECIMAL(10,2) NOT NULL,
    "compareAt" DECIMAL(10,2),
    "category" TEXT NOT NULL,
    "fabric" TEXT,
    "careGuide" TEXT,
    "aiImages" JSONB NOT NULL DEFAULT '[]',
    "sizeGuide" JSONB NOT NULL DEFAULT '{}',
    "status" "ProductStatus" NOT NULL DEFAULT 'DRAFT',
    "dropshipSupplierId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductVariant" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "size" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "price" DECIMAL(10,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Address" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "label" TEXT,
    "fullName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "addressLine1" TEXT NOT NULL,
    "addressLine2" TEXT,
    "city" TEXT NOT NULL,
    "emirate" TEXT,
    "country" TEXT NOT NULL DEFAULT 'AE',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Address_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "addressId" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "subtotal" DECIMAL(10,2) NOT NULL,
    "discount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "shippingFee" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(10,2) NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "shipmentId" TEXT,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DECIMAL(10,2) NOT NULL,
    "fulfillmentStatus" "FulfillmentStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Return" (
    "id" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "status" "ReturnStatus" NOT NULL DEFAULT 'REQUESTED',
    "reason" TEXT NOT NULL,
    "approvalNotes" TEXT,
    "refundAmount" DECIMAL(10,2) NOT NULL,
    "isRestocked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Return_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shipment" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "courier" TEXT NOT NULL,
    "trackingNumber" TEXT,
    "externalRef" TEXT,
    "labelUrl" TEXT,
    "status" "ShipmentStatus" NOT NULL DEFAULT 'CREATED',
    "supplierId" TEXT,
    "estimatedDelivery" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "cost" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentTransaction" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'AED',
    "externalRef" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletTransaction" (
    "id" TEXT NOT NULL,
    "customerProfileId" TEXT NOT NULL,
    "type" "WalletTxnType" NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "balanceAfter" DECIMAL(10,2) NOT NULL,
    "orderId" TEXT,
    "reference" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payout" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'AED',
    "status" "PayoutStatus" NOT NULL DEFAULT 'PENDING',
    "ibanNumber" TEXT NOT NULL,
    "reference" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierPayout" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'AED',
    "status" "PayoutStatus" NOT NULL DEFAULT 'PENDING',
    "ibanNumber" TEXT NOT NULL,
    "reference" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierPayout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerEntry" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "entryType" "LedgerEntryType" NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'AED',
    "orderId" TEXT,
    "orderItemId" TEXT,
    "payoutId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "actorRole" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboxEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "customerProfileId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "body" TEXT,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Wishlist" (
    "id" TEXT NOT NULL,
    "customerProfileId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Wishlist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "data" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AISession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "agentType" "AIAgentType" NOT NULL,
    "messages" JSONB NOT NULL DEFAULT '[]',
    "context" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AISession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudioUpload" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "sourceImages" JSONB NOT NULL DEFAULT '[]',
    "generatedAssets" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "productId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudioUpload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformSetting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GarmentAsset" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "productId" TEXT,
    "status" "GarmentStatus" NOT NULL DEFAULT 'UPLOADED',
    "category" TEXT,
    "silhouette" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GarmentAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GarmentImage" (
    "id" TEXT NOT NULL,
    "garmentId" TEXT NOT NULL,
    "role" "GarmentImageRole" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "qcPassed" BOOLEAN NOT NULL DEFAULT false,
    "qcIssues" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GarmentImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GarmentAnalysis" (
    "id" TEXT NOT NULL,
    "garmentId" TEXT NOT NULL,
    "colors" JSONB NOT NULL DEFAULT '[]',
    "material" TEXT,
    "pattern" TEXT,
    "length" TEXT,
    "sleeve" TEXT,
    "neckline" TEXT,
    "closure" TEXT,
    "buttons" JSONB NOT NULL DEFAULT '{}',
    "embroidery" JSONB NOT NULL DEFAULT '{}',
    "logo" JSONB NOT NULL DEFAULT '{}',
    "pockets" JSONB NOT NULL DEFAULT '{}',
    "belt" JSONB NOT NULL DEFAULT '{}',
    "segmentationMasks" JSONB NOT NULL DEFAULT '[]',
    "detailCrops" JSONB NOT NULL DEFAULT '[]',
    "embeddings" JSONB NOT NULL DEFAULT '{}',
    "modelName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GarmentAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIModelProfile" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT,
    "name" TEXT NOT NULL,
    "descriptor" JSONB NOT NULL DEFAULT '{}',
    "referenceKeys" JSONB NOT NULL DEFAULT '[]',
    "seed" BIGINT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isShared" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIModelProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GenerationSession" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "garmentId" TEXT NOT NULL,
    "modelProfileId" TEXT,
    "productId" TEXT,
    "status" "StudioSessionStatus" NOT NULL DEFAULT 'DRAFT',
    "seed" BIGINT,
    "referenceKeys" JSONB NOT NULL DEFAULT '[]',
    "lighting" JSONB NOT NULL DEFAULT '{}',
    "environment" JSONB NOT NULL DEFAULT '{}',
    "camera" JSONB NOT NULL DEFAULT '{}',
    "backgroundId" TEXT,
    "provider" TEXT,
    "providerParams" JSONB NOT NULL DEFAULT '{}',
    "resolution" TEXT,
    "correlationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GenerationSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GenerationJob" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "kind" "GenerationJobKind" NOT NULL,
    "state" "GenerationJobState" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "idempotencyKey" TEXT NOT NULL,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "provider" TEXT,
    "providerRef" TEXT,
    "error" TEXT,
    "correlationId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GenerationJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GeneratedAsset" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "type" "GeneratedAssetType" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "cdnUrl" TEXT,
    "provider" TEXT NOT NULL,
    "providerModel" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "durationSec" DECIMAL(5,2),
    "c2paSigned" BOOLEAN NOT NULL DEFAULT false,
    "isSimulated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GeneratedAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Provider" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "operations" JSONB NOT NULL DEFAULT '[]',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "Provider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderModel" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "modelCode" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "unitCost" DECIMAL(10,6) NOT NULL,
    "unit" TEXT NOT NULL,
    "minPlanTier" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ProviderModel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionPlan" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priceMonthly" DECIMAL(10,2) NOT NULL,
    "priceAnnual" DECIMAL(10,2),
    "currency" TEXT NOT NULL DEFAULT 'AED',
    "includedShoots" INTEGER NOT NULL,
    "maxResolution" TEXT NOT NULL DEFAULT '2K',
    "allowedModels" JSONB NOT NULL DEFAULT '[]',
    "downloadsAllowed" BOOLEAN NOT NULL DEFAULT true,
    "rolloverShoots" INTEGER NOT NULL DEFAULT 0,
    "overageCreditPrice" DECIMAL(10,2),
    "monthlyLimit" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriptionPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudioSubscription" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" "StudioSubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "billingCycle" "StudioBillingCycle" NOT NULL DEFAULT 'MONTHLY',
    "currentPeriodStart" TIMESTAMP(3) NOT NULL,
    "currentPeriodEnd" TIMESTAMP(3) NOT NULL,
    "stripeSubscriptionId" TEXT,
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudioSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditWallet" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "available" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "reserved" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "lifetimeConsumed" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditWallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditTransaction" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "type" "CreditTxnType" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "balanceAfter" DECIMAL(12,2) NOT NULL,
    "sessionId" TEXT,
    "jobId" TEXT,
    "paymentId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "reason" TEXT,
    "actor" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditPackage" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "credits" INTEGER NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'AED',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditPackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudioPayment" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "kind" "StudioPaymentKind" NOT NULL,
    "status" "StudioPaymentStatus" NOT NULL DEFAULT 'PENDING',
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'AED',
    "method" TEXT NOT NULL DEFAULT 'CARD',
    "planId" TEXT,
    "billingCycle" "StudioBillingCycle",
    "packageId" TEXT,
    "grantedCredits" INTEGER NOT NULL DEFAULT 0,
    "externalRef" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudioPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudioInvoice" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "sellerName" TEXT NOT NULL DEFAULT 'AYVANA',
    "sellerTRN" TEXT,
    "buyerName" TEXT NOT NULL,
    "buyerTRN" TEXT,
    "subtotal" DECIMAL(10,2) NOT NULL,
    "vatRate" DECIMAL(4,2) NOT NULL DEFAULT 0.05,
    "vatAmount" DECIMAL(10,2) NOT NULL,
    "total" DECIMAL(10,2) NOT NULL,
    "lines" JSONB NOT NULL DEFAULT '[]',
    "externalRef" TEXT,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudioInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseCategory" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "defaultPriority" "CasePriority" NOT NULL DEFAULT 'MEDIUM',
    "defaultTeam" "CaseTeam",
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CaseCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Case" (
    "id" TEXT NOT NULL,
    "caseNumber" TEXT NOT NULL,
    "type" "CaseType" NOT NULL,
    "categoryId" TEXT NOT NULL,
    "channel" "CaseChannel" NOT NULL,
    "status" "CaseStatus" NOT NULL DEFAULT 'NEW',
    "priority" "CasePriority" NOT NULL DEFAULT 'MEDIUM',
    "subject" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "openerUserId" TEXT,
    "openerRole" "CaseOpenerRole" NOT NULL,
    "contactName" TEXT NOT NULL,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "customerId" TEXT,
    "vendorId" TEXT,
    "supplierId" TEXT,
    "orderId" TEXT,
    "studioSessionId" TEXT,
    "assignedToUserId" TEXT,
    "assignedTeam" "CaseTeam",
    "suggestedCategoryId" TEXT,
    "suggestedPriority" "CasePriority",
    "firstResponseDueAt" TIMESTAMP(3),
    "resolutionDueAt" TIMESTAMP(3),
    "firstRespondedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "relatedReturnId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Case_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseMessage" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "authorUserId" TEXT,
    "authorRole" "CaseAuthorRole" NOT NULL,
    "body" TEXT NOT NULL,
    "isInternal" BOOLEAN NOT NULL DEFAULT false,
    "channel" "CaseChannel" NOT NULL,
    "attachments" JSONB NOT NULL DEFAULT '[]',
    "externalRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaseMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseEvent" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "type" "CaseEventType" NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaseEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GenerationCost" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "planCode" TEXT,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "images" INTEGER NOT NULL DEFAULT 0,
    "retries" INTEGER NOT NULL DEFAULT 0,
    "videoSeconds" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "resolution" TEXT,
    "tokens" INTEGER NOT NULL DEFAULT 0,
    "gpuCost" DECIMAL(10,6) NOT NULL DEFAULT 0,
    "storageCost" DECIMAL(10,6) NOT NULL DEFAULT 0,
    "cdnCost" DECIMAL(10,6) NOT NULL DEFAULT 0,
    "moderationCost" DECIMAL(10,6) NOT NULL DEFAULT 0,
    "qaCost" DECIMAL(10,6) NOT NULL DEFAULT 0,
    "totalVariableCost" DECIMAL(10,4) NOT NULL,
    "sellerRevenue" DECIMAL(10,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GenerationCost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderUsage" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT,
    "jobId" TEXT,
    "providerCode" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "units" DECIMAL(12,4) NOT NULL,
    "cost" DECIMAL(10,6) NOT NULL,
    "latencyMs" INTEGER,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "correlationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerProfile_userId_key" ON "CustomerProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "SizeProfile_customerProfileId_key" ON "SizeProfile"("customerProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "Vendor_userId_key" ON "Vendor"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Vendor_storeSlug_key" ON "Vendor"("storeSlug");

-- CreateIndex
CREATE INDEX "Vendor_status_idx" ON "Vendor"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_userId_key" ON "Supplier"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_companySlug_key" ON "Supplier"("companySlug");

-- CreateIndex
CREATE INDEX "Supplier_status_idx" ON "Supplier"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Material_slug_key" ON "Material"("slug");

-- CreateIndex
CREATE INDEX "Material_supplierId_idx" ON "Material"("supplierId");

-- CreateIndex
CREATE INDEX "Material_status_idx" ON "Material"("status");

-- CreateIndex
CREATE INDEX "Material_supplierId_status_idx" ON "Material"("supplierId", "status");

-- CreateIndex
CREATE INDEX "MaterialOrder_vendorId_idx" ON "MaterialOrder"("vendorId");

-- CreateIndex
CREATE INDEX "MaterialOrder_supplierId_idx" ON "MaterialOrder"("supplierId");

-- CreateIndex
CREATE INDEX "MaterialOrder_supplierId_status_idx" ON "MaterialOrder"("supplierId", "status");

-- CreateIndex
CREATE INDEX "MaterialOrder_vendorId_status_idx" ON "MaterialOrder"("vendorId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "MaterialReturn_orderId_key" ON "MaterialReturn"("orderId");

-- CreateIndex
CREATE INDEX "MaterialReturn_supplierId_idx" ON "MaterialReturn"("supplierId");

-- CreateIndex
CREATE INDEX "MaterialReturn_vendorId_idx" ON "MaterialReturn"("vendorId");

-- CreateIndex
CREATE INDEX "MaterialReturn_supplierId_status_idx" ON "MaterialReturn"("supplierId", "status");

-- CreateIndex
CREATE INDEX "MaterialOrderItem_orderId_idx" ON "MaterialOrderItem"("orderId");

-- CreateIndex
CREATE INDEX "MaterialOrderItem_materialId_idx" ON "MaterialOrderItem"("materialId");

-- CreateIndex
CREATE UNIQUE INDEX "MaterialInvoice_invoiceNumber_key" ON "MaterialInvoice"("invoiceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "MaterialInvoice_materialOrderId_key" ON "MaterialInvoice"("materialOrderId");

-- CreateIndex
CREATE INDEX "MaterialInvoice_supplierId_idx" ON "MaterialInvoice"("supplierId");

-- CreateIndex
CREATE INDEX "MaterialInvoice_supplierId_issuedAt_idx" ON "MaterialInvoice"("supplierId", "issuedAt");

-- CreateIndex
CREATE UNIQUE INDEX "OrderInvoice_invoiceNumber_key" ON "OrderInvoice"("invoiceNumber");

-- CreateIndex
CREATE INDEX "OrderInvoice_vendorId_idx" ON "OrderInvoice"("vendorId");

-- CreateIndex
CREATE INDEX "OrderInvoice_vendorId_issuedAt_idx" ON "OrderInvoice"("vendorId", "issuedAt");

-- CreateIndex
CREATE UNIQUE INDEX "OrderInvoice_orderId_vendorId_key" ON "OrderInvoice"("orderId", "vendorId");

-- CreateIndex
CREATE UNIQUE INDEX "Product_slug_key" ON "Product"("slug");

-- CreateIndex
CREATE INDEX "Product_vendorId_idx" ON "Product"("vendorId");

-- CreateIndex
CREATE INDEX "Product_status_idx" ON "Product"("status");

-- CreateIndex
CREATE INDEX "Product_vendorId_status_idx" ON "Product"("vendorId", "status");

-- CreateIndex
CREATE INDEX "Product_dropshipSupplierId_idx" ON "Product"("dropshipSupplierId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductVariant_sku_key" ON "ProductVariant"("sku");

-- CreateIndex
CREATE INDEX "ProductVariant_productId_idx" ON "ProductVariant"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductVariant_productId_size_color_key" ON "ProductVariant"("productId", "size", "color");

-- CreateIndex
CREATE INDEX "Address_userId_idx" ON "Address"("userId");

-- CreateIndex
CREATE INDEX "Order_customerId_idx" ON "Order"("customerId");

-- CreateIndex
CREATE INDEX "Order_status_idx" ON "Order"("status");

-- CreateIndex
CREATE INDEX "Order_customerId_status_idx" ON "Order"("customerId", "status");

-- CreateIndex
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");

-- CreateIndex
CREATE INDEX "OrderItem_variantId_idx" ON "OrderItem"("variantId");

-- CreateIndex
CREATE INDEX "OrderItem_vendorId_idx" ON "OrderItem"("vendorId");

-- CreateIndex
CREATE INDEX "OrderItem_shipmentId_idx" ON "OrderItem"("shipmentId");

-- CreateIndex
CREATE INDEX "OrderItem_orderId_fulfillmentStatus_idx" ON "OrderItem"("orderId", "fulfillmentStatus");

-- CreateIndex
CREATE INDEX "OrderItem_vendorId_fulfillmentStatus_idx" ON "OrderItem"("vendorId", "fulfillmentStatus");

-- CreateIndex
CREATE INDEX "Return_orderItemId_idx" ON "Return"("orderItemId");

-- CreateIndex
CREATE INDEX "Return_status_idx" ON "Return"("status");

-- CreateIndex
CREATE INDEX "Shipment_orderId_idx" ON "Shipment"("orderId");

-- CreateIndex
CREATE INDEX "Shipment_vendorId_idx" ON "Shipment"("vendorId");

-- CreateIndex
CREATE INDEX "Shipment_supplierId_idx" ON "Shipment"("supplierId");

-- CreateIndex
CREATE INDEX "Shipment_status_idx" ON "Shipment"("status");

-- CreateIndex
CREATE INDEX "Shipment_trackingNumber_idx" ON "Shipment"("trackingNumber");

-- CreateIndex
CREATE INDEX "Shipment_externalRef_idx" ON "Shipment"("externalRef");

-- CreateIndex
CREATE INDEX "Shipment_vendorId_status_idx" ON "Shipment"("vendorId", "status");

-- CreateIndex
CREATE INDEX "Shipment_supplierId_status_idx" ON "Shipment"("supplierId", "status");

-- CreateIndex
CREATE INDEX "PaymentTransaction_orderId_idx" ON "PaymentTransaction"("orderId");

-- CreateIndex
CREATE INDEX "PaymentTransaction_status_idx" ON "PaymentTransaction"("status");

-- CreateIndex
CREATE INDEX "WalletTransaction_customerProfileId_idx" ON "WalletTransaction"("customerProfileId");

-- CreateIndex
CREATE INDEX "WalletTransaction_orderId_idx" ON "WalletTransaction"("orderId");

-- CreateIndex
CREATE INDEX "WalletTransaction_type_idx" ON "WalletTransaction"("type");

-- CreateIndex
CREATE INDEX "WalletTransaction_customerProfileId_type_idx" ON "WalletTransaction"("customerProfileId", "type");

-- CreateIndex
CREATE INDEX "Payout_vendorId_idx" ON "Payout"("vendorId");

-- CreateIndex
CREATE INDEX "Payout_status_idx" ON "Payout"("status");

-- CreateIndex
CREATE INDEX "SupplierPayout_supplierId_idx" ON "SupplierPayout"("supplierId");

-- CreateIndex
CREATE INDEX "SupplierPayout_status_idx" ON "SupplierPayout"("status");

-- CreateIndex
CREATE INDEX "LedgerEntry_vendorId_idx" ON "LedgerEntry"("vendorId");

-- CreateIndex
CREATE INDEX "LedgerEntry_entryType_idx" ON "LedgerEntry"("entryType");

-- CreateIndex
CREATE INDEX "LedgerEntry_payoutId_idx" ON "LedgerEntry"("payoutId");

-- CreateIndex
CREATE INDEX "LedgerEntry_orderId_idx" ON "LedgerEntry"("orderId");

-- CreateIndex
CREATE INDEX "LedgerEntry_vendorId_entryType_idx" ON "LedgerEntry"("vendorId", "entryType");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_idx" ON "AuditLog"("actorId");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE INDEX "AuditLog_targetType_targetId_idx" ON "AuditLog"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "OutboxEvent_status_availableAt_idx" ON "OutboxEvent"("status", "availableAt");

-- CreateIndex
CREATE INDEX "OutboxEvent_type_idx" ON "OutboxEvent"("type");

-- CreateIndex
CREATE INDEX "Review_productId_idx" ON "Review"("productId");

-- CreateIndex
CREATE INDEX "Review_customerProfileId_idx" ON "Review"("customerProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "Review_customerProfileId_productId_key" ON "Review"("customerProfileId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "Wishlist_customerProfileId_productId_key" ON "Wishlist"("customerProfileId", "productId");

-- CreateIndex
CREATE INDEX "Notification_userId_idx" ON "Notification"("userId");

-- CreateIndex
CREATE INDEX "Notification_userId_isRead_idx" ON "Notification"("userId", "isRead");

-- CreateIndex
CREATE INDEX "AISession_userId_idx" ON "AISession"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AISession_userId_agentType_key" ON "AISession"("userId", "agentType");

-- CreateIndex
CREATE INDEX "StudioUpload_vendorId_idx" ON "StudioUpload"("vendorId");

-- CreateIndex
CREATE UNIQUE INDEX "Category_slug_key" ON "Category"("slug");

-- CreateIndex
CREATE INDEX "Category_isActive_sortOrder_idx" ON "Category"("isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "GarmentAsset_vendorId_idx" ON "GarmentAsset"("vendorId");

-- CreateIndex
CREATE INDEX "GarmentAsset_vendorId_status_idx" ON "GarmentAsset"("vendorId", "status");

-- CreateIndex
CREATE INDEX "GarmentAsset_productId_idx" ON "GarmentAsset"("productId");

-- CreateIndex
CREATE INDEX "GarmentImage_garmentId_idx" ON "GarmentImage"("garmentId");

-- CreateIndex
CREATE INDEX "GarmentImage_garmentId_role_idx" ON "GarmentImage"("garmentId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "GarmentAnalysis_garmentId_key" ON "GarmentAnalysis"("garmentId");

-- CreateIndex
CREATE INDEX "AIModelProfile_vendorId_idx" ON "AIModelProfile"("vendorId");

-- CreateIndex
CREATE INDEX "AIModelProfile_isShared_isActive_idx" ON "AIModelProfile"("isShared", "isActive");

-- CreateIndex
CREATE INDEX "GenerationSession_vendorId_idx" ON "GenerationSession"("vendorId");

-- CreateIndex
CREATE INDEX "GenerationSession_vendorId_status_idx" ON "GenerationSession"("vendorId", "status");

-- CreateIndex
CREATE INDEX "GenerationSession_garmentId_idx" ON "GenerationSession"("garmentId");

-- CreateIndex
CREATE UNIQUE INDEX "GenerationJob_idempotencyKey_key" ON "GenerationJob"("idempotencyKey");

-- CreateIndex
CREATE INDEX "GenerationJob_state_availableAt_idx" ON "GenerationJob"("state", "availableAt");

-- CreateIndex
CREATE INDEX "GenerationJob_sessionId_idx" ON "GenerationJob"("sessionId");

-- CreateIndex
CREATE INDEX "GenerationJob_correlationId_idx" ON "GenerationJob"("correlationId");

-- CreateIndex
CREATE INDEX "GeneratedAsset_sessionId_idx" ON "GeneratedAsset"("sessionId");

-- CreateIndex
CREATE INDEX "GeneratedAsset_sessionId_type_idx" ON "GeneratedAsset"("sessionId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "Provider_code_key" ON "Provider"("code");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderModel_providerId_modelCode_key" ON "ProviderModel"("providerId", "modelCode");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionPlan_code_key" ON "SubscriptionPlan"("code");

-- CreateIndex
CREATE UNIQUE INDEX "StudioSubscription_vendorId_key" ON "StudioSubscription"("vendorId");

-- CreateIndex
CREATE INDEX "StudioSubscription_status_idx" ON "StudioSubscription"("status");

-- CreateIndex
CREATE INDEX "StudioSubscription_currentPeriodEnd_idx" ON "StudioSubscription"("currentPeriodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "CreditWallet_vendorId_key" ON "CreditWallet"("vendorId");

-- CreateIndex
CREATE INDEX "CreditWallet_vendorId_idx" ON "CreditWallet"("vendorId");

-- CreateIndex
CREATE UNIQUE INDEX "CreditTransaction_idempotencyKey_key" ON "CreditTransaction"("idempotencyKey");

-- CreateIndex
CREATE INDEX "CreditTransaction_walletId_idx" ON "CreditTransaction"("walletId");

-- CreateIndex
CREATE INDEX "CreditTransaction_vendorId_idx" ON "CreditTransaction"("vendorId");

-- CreateIndex
CREATE INDEX "CreditTransaction_walletId_createdAt_idx" ON "CreditTransaction"("walletId", "createdAt");

-- CreateIndex
CREATE INDEX "CreditTransaction_sessionId_idx" ON "CreditTransaction"("sessionId");

-- CreateIndex
CREATE INDEX "CreditTransaction_vendorId_createdAt_idx" ON "CreditTransaction"("vendorId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CreditPackage_code_key" ON "CreditPackage"("code");

-- CreateIndex
CREATE UNIQUE INDEX "StudioPayment_idempotencyKey_key" ON "StudioPayment"("idempotencyKey");

-- CreateIndex
CREATE INDEX "StudioPayment_vendorId_idx" ON "StudioPayment"("vendorId");

-- CreateIndex
CREATE INDEX "StudioPayment_status_idx" ON "StudioPayment"("status");

-- CreateIndex
CREATE UNIQUE INDEX "StudioInvoice_paymentId_key" ON "StudioInvoice"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "StudioInvoice_invoiceNumber_key" ON "StudioInvoice"("invoiceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "CaseCategory_slug_key" ON "CaseCategory"("slug");

-- CreateIndex
CREATE INDEX "CaseCategory_isActive_sortOrder_idx" ON "CaseCategory"("isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "Case_caseNumber_key" ON "Case"("caseNumber");

-- CreateIndex
CREATE INDEX "Case_status_idx" ON "Case"("status");

-- CreateIndex
CREATE INDEX "Case_assignedToUserId_status_idx" ON "Case"("assignedToUserId", "status");

-- CreateIndex
CREATE INDEX "Case_customerId_idx" ON "Case"("customerId");

-- CreateIndex
CREATE INDEX "Case_vendorId_idx" ON "Case"("vendorId");

-- CreateIndex
CREATE INDEX "Case_supplierId_idx" ON "Case"("supplierId");

-- CreateIndex
CREATE INDEX "Case_channel_idx" ON "Case"("channel");

-- CreateIndex
CREATE INDEX "Case_categoryId_idx" ON "Case"("categoryId");

-- CreateIndex
CREATE INDEX "Case_priority_status_idx" ON "Case"("priority", "status");

-- CreateIndex
CREATE INDEX "Case_contactPhone_idx" ON "Case"("contactPhone");

-- CreateIndex
CREATE INDEX "Case_openerUserId_status_idx" ON "Case"("openerUserId", "status");

-- CreateIndex
CREATE INDEX "CaseMessage_caseId_createdAt_idx" ON "CaseMessage"("caseId", "createdAt");

-- CreateIndex
CREATE INDEX "CaseEvent_caseId_createdAt_idx" ON "CaseEvent"("caseId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "GenerationCost_sessionId_key" ON "GenerationCost"("sessionId");

-- CreateIndex
CREATE INDEX "GenerationCost_createdAt_idx" ON "GenerationCost"("createdAt");

-- CreateIndex
CREATE INDEX "GenerationCost_vendorId_idx" ON "GenerationCost"("vendorId");

-- CreateIndex
CREATE INDEX "GenerationCost_planCode_idx" ON "GenerationCost"("planCode");

-- CreateIndex
CREATE INDEX "ProviderUsage_providerCode_createdAt_idx" ON "ProviderUsage"("providerCode", "createdAt");

-- CreateIndex
CREATE INDEX "ProviderUsage_sessionId_idx" ON "ProviderUsage"("sessionId");

-- CreateIndex
CREATE INDEX "ProviderUsage_operation_idx" ON "ProviderUsage"("operation");

-- AddForeignKey
ALTER TABLE "CustomerProfile" ADD CONSTRAINT "CustomerProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SizeProfile" ADD CONSTRAINT "SizeProfile_customerProfileId_fkey" FOREIGN KEY ("customerProfileId") REFERENCES "CustomerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vendor" ADD CONSTRAINT "Vendor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Material" ADD CONSTRAINT "Material_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialOrder" ADD CONSTRAINT "MaterialOrder_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialOrder" ADD CONSTRAINT "MaterialOrder_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialReturn" ADD CONSTRAINT "MaterialReturn_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "MaterialOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialReturn" ADD CONSTRAINT "MaterialReturn_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialReturn" ADD CONSTRAINT "MaterialReturn_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialOrderItem" ADD CONSTRAINT "MaterialOrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "MaterialOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialOrderItem" ADD CONSTRAINT "MaterialOrderItem_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialInvoice" ADD CONSTRAINT "MaterialInvoice_materialOrderId_fkey" FOREIGN KEY ("materialOrderId") REFERENCES "MaterialOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialInvoice" ADD CONSTRAINT "MaterialInvoice_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderInvoice" ADD CONSTRAINT "OrderInvoice_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderInvoice" ADD CONSTRAINT "OrderInvoice_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_dropshipSupplierId_fkey" FOREIGN KEY ("dropshipSupplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Address" ADD CONSTRAINT "Address_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "CustomerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_addressId_fkey" FOREIGN KEY ("addressId") REFERENCES "Address"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Return" ADD CONSTRAINT "Return_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Return" ADD CONSTRAINT "Return_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentTransaction" ADD CONSTRAINT "PaymentTransaction_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_customerProfileId_fkey" FOREIGN KEY ("customerProfileId") REFERENCES "CustomerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPayout" ADD CONSTRAINT "SupplierPayout_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_customerProfileId_fkey" FOREIGN KEY ("customerProfileId") REFERENCES "CustomerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Wishlist" ADD CONSTRAINT "Wishlist_customerProfileId_fkey" FOREIGN KEY ("customerProfileId") REFERENCES "CustomerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Wishlist" ADD CONSTRAINT "Wishlist_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AISession" ADD CONSTRAINT "AISession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudioUpload" ADD CONSTRAINT "StudioUpload_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GarmentAsset" ADD CONSTRAINT "GarmentAsset_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GarmentAsset" ADD CONSTRAINT "GarmentAsset_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GarmentImage" ADD CONSTRAINT "GarmentImage_garmentId_fkey" FOREIGN KEY ("garmentId") REFERENCES "GarmentAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GarmentAnalysis" ADD CONSTRAINT "GarmentAnalysis_garmentId_fkey" FOREIGN KEY ("garmentId") REFERENCES "GarmentAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIModelProfile" ADD CONSTRAINT "AIModelProfile_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GenerationSession" ADD CONSTRAINT "GenerationSession_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GenerationSession" ADD CONSTRAINT "GenerationSession_garmentId_fkey" FOREIGN KEY ("garmentId") REFERENCES "GarmentAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GenerationSession" ADD CONSTRAINT "GenerationSession_modelProfileId_fkey" FOREIGN KEY ("modelProfileId") REFERENCES "AIModelProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GenerationSession" ADD CONSTRAINT "GenerationSession_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GenerationJob" ADD CONSTRAINT "GenerationJob_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "GenerationSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedAsset" ADD CONSTRAINT "GeneratedAsset_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "GenerationSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderModel" ADD CONSTRAINT "ProviderModel_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudioSubscription" ADD CONSTRAINT "StudioSubscription_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudioSubscription" ADD CONSTRAINT "StudioSubscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SubscriptionPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditWallet" ADD CONSTRAINT "CreditWallet_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditTransaction" ADD CONSTRAINT "CreditTransaction_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "CreditWallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudioInvoice" ADD CONSTRAINT "StudioInvoice_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "StudioPayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "CaseCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseMessage" ADD CONSTRAINT "CaseMessage_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseEvent" ADD CONSTRAINT "CaseEvent_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

