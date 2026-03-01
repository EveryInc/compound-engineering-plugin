# Snowflake Terraform Infrastructure

Reference for the Snowflake Terraform provider v2.0+, resource patterns, RBAC, authentication, and state management.

---

## Provider Setup

### Required configuration

```hcl
terraform {
  required_version = ">= 1.5.0"

  required_providers {
    snowflake = {
      source  = "Snowflake-Labs/snowflake"
      version = "~> 2.0"
    }
  }

  # SECURITY: Always use a remote backend. Never store state locally.
  backend "s3" {
    bucket         = "company-terraform-state"
    key            = "snowflake/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "terraform-locks"
  }
}

# Configure provider using environment variables — never inline credentials
provider "snowflake" {
  organization_name = var.snowflake_organization_name
  account_name      = var.snowflake_account_name
  user              = var.snowflake_user
  # Key-pair auth is preferred. Set SNOWFLAKE_PRIVATE_KEY_PATH env var.
}
```

### Environment variables for authentication

```bash
# Prefer key-pair authentication over password
export SNOWFLAKE_ORGANIZATION_NAME="my_org"
export SNOWFLAKE_ACCOUNT_NAME="my_account"
export SNOWFLAKE_USER="terraform_svc"
export SNOWFLAKE_PRIVATE_KEY_PATH="/path/to/rsa_key.p8"

# Alternative: password auth (less secure, avoid in production)
# export SNOWFLAKE_PASSWORD="..."
```

### Required .gitignore entries

```gitignore
# Terraform state — NEVER commit state files
*.tfstate
*.tfstate.*
.terraform/
.terraform.lock.hcl

# Credentials and keys
*.p8
*.pem
.env
```

---

## Key Resources

### Databases and schemas

```hcl
resource "snowflake_database" "analytics" {
  name                        = "ANALYTICS"
  comment                     = "Analytics data warehouse"
  data_retention_time_in_days = 7
}

resource "snowflake_schema" "raw" {
  database = snowflake_database.analytics.name
  name     = "RAW"
  comment  = "Raw ingested data"

  data_retention_time_in_days = 1
}

resource "snowflake_schema" "staging" {
  database = snowflake_database.analytics.name
  name     = "STAGING"
  comment  = "Staging area for transformations"

  data_retention_time_in_days = 1
  is_transient                = true
}

resource "snowflake_schema" "marts" {
  database = snowflake_database.analytics.name
  name     = "MARTS"
  comment  = "Business-facing data marts"

  data_retention_time_in_days = 7
}
```

### Warehouses

```hcl
resource "snowflake_warehouse" "etl" {
  name                                = "ETL_WH"
  warehouse_size                      = "MEDIUM"
  auto_suspend                        = 60
  auto_resume                         = true
  initially_suspended                 = true
  comment                             = "ELT pipeline compute"
  enable_query_acceleration           = false
  warehouse_type                      = "STANDARD"
}

resource "snowflake_warehouse" "bi" {
  name                                = "BI_WH"
  warehouse_size                      = "SMALL"
  auto_suspend                        = 300
  auto_resume                         = true
  initially_suspended                 = true
  min_cluster_count                   = 1
  max_cluster_count                   = 3
  scaling_policy                      = "STANDARD"
  comment                             = "Business intelligence dashboards"
}

resource "snowflake_warehouse" "dev" {
  name                                = "DEV_WH"
  warehouse_size                      = "XSMALL"
  auto_suspend                        = 60
  auto_resume                         = true
  initially_suspended                 = true
  comment                             = "Development and testing"
}
```

### Resource monitors

```hcl
resource "snowflake_resource_monitor" "monthly" {
  name            = "MONTHLY_BUDGET"
  credit_quota    = 1000
  frequency       = "MONTHLY"
  start_timestamp = "IMMEDIATELY"

  notify_triggers = [75, 90]
  suspend_trigger = 100
  suspend_immediately_trigger = 110
}
```

---

## Role Hierarchy and RBAC

Design a role hierarchy that follows least-privilege principles.

### Standard role hierarchy

```
ACCOUNTADMIN
  └── SYSADMIN
        ├── ANALYTICS_ADMIN
        │     ├── ANALYTICS_WRITER
        │     └── ANALYTICS_READER
        ├── ETL_ADMIN
        │     └── ETL_RUNNER
        └── DEV_ADMIN
              └── DEVELOPER
  └── SECURITYADMIN
        └── (manages role grants)
```

### Define roles

```hcl
resource "snowflake_account_role" "analytics_admin" {
  name    = "ANALYTICS_ADMIN"
  comment = "Full control over analytics database"
}

resource "snowflake_account_role" "analytics_writer" {
  name    = "ANALYTICS_WRITER"
  comment = "Read/write access to analytics schemas"
}

resource "snowflake_account_role" "analytics_reader" {
  name    = "ANALYTICS_READER"
  comment = "Read-only access to analytics marts"
}

resource "snowflake_account_role" "etl_runner" {
  name    = "ETL_RUNNER"
  comment = "Execute ELT pipelines"
}

resource "snowflake_account_role" "developer" {
  name    = "DEVELOPER"
  comment = "Development environment access"
}
```

### Build role hierarchy

```hcl
# ANALYTICS_READER -> ANALYTICS_WRITER -> ANALYTICS_ADMIN -> SYSADMIN
resource "snowflake_grant_account_role" "reader_to_writer" {
  role_name        = snowflake_account_role.analytics_reader.name
  parent_role_name = snowflake_account_role.analytics_writer.name
}

resource "snowflake_grant_account_role" "writer_to_admin" {
  role_name        = snowflake_account_role.analytics_writer.name
  parent_role_name = snowflake_account_role.analytics_admin.name
}

resource "snowflake_grant_account_role" "admin_to_sysadmin" {
  role_name        = snowflake_account_role.analytics_admin.name
  parent_role_name = "SYSADMIN"
}

resource "snowflake_grant_account_role" "etl_to_sysadmin" {
  role_name        = snowflake_account_role.etl_runner.name
  parent_role_name = "SYSADMIN"
}

resource "snowflake_grant_account_role" "dev_to_sysadmin" {
  role_name        = snowflake_account_role.developer.name
  parent_role_name = "SYSADMIN"
}
```

---

## Grant Patterns

### Database grants

```hcl
resource "snowflake_grant_privileges_to_account_role" "analytics_admin_db" {
  privileges        = ["USAGE", "CREATE SCHEMA"]
  account_role_name = snowflake_account_role.analytics_admin.name
  on_account_object {
    object_type = "DATABASE"
    object_name = snowflake_database.analytics.name
  }
}

resource "snowflake_grant_privileges_to_account_role" "analytics_reader_db" {
  privileges        = ["USAGE"]
  account_role_name = snowflake_account_role.analytics_reader.name
  on_account_object {
    object_type = "DATABASE"
    object_name = snowflake_database.analytics.name
  }
}
```

### Schema grants

```hcl
resource "snowflake_grant_privileges_to_account_role" "reader_schema_usage" {
  privileges        = ["USAGE"]
  account_role_name = snowflake_account_role.analytics_reader.name
  on_schema {
    schema_name = "\"${snowflake_database.analytics.name}\".\"${snowflake_schema.marts.name}\""
  }
}

resource "snowflake_grant_privileges_to_account_role" "writer_schema_all" {
  privileges        = ["USAGE", "CREATE TABLE", "CREATE VIEW"]
  account_role_name = snowflake_account_role.analytics_writer.name
  on_schema {
    schema_name = "\"${snowflake_database.analytics.name}\".\"${snowflake_schema.staging.name}\""
  }
}
```

### Future grants (apply to objects created later)

```hcl
resource "snowflake_grant_privileges_to_account_role" "reader_future_tables" {
  privileges        = ["SELECT"]
  account_role_name = snowflake_account_role.analytics_reader.name
  on_schema_object {
    future {
      object_type_plural = "TABLES"
      in_schema          = "\"${snowflake_database.analytics.name}\".\"${snowflake_schema.marts.name}\""
    }
  }
}

resource "snowflake_grant_privileges_to_account_role" "reader_future_views" {
  privileges        = ["SELECT"]
  account_role_name = snowflake_account_role.analytics_reader.name
  on_schema_object {
    future {
      object_type_plural = "VIEWS"
      in_schema          = "\"${snowflake_database.analytics.name}\".\"${snowflake_schema.marts.name}\""
    }
  }
}
```

### Warehouse grants

```hcl
resource "snowflake_grant_privileges_to_account_role" "etl_warehouse" {
  privileges        = ["USAGE", "OPERATE"]
  account_role_name = snowflake_account_role.etl_runner.name
  on_account_object {
    object_type = "WAREHOUSE"
    object_name = snowflake_warehouse.etl.name
  }
}

resource "snowflake_grant_privileges_to_account_role" "bi_warehouse" {
  privileges        = ["USAGE"]
  account_role_name = snowflake_account_role.analytics_reader.name
  on_account_object {
    object_type = "WAREHOUSE"
    object_name = snowflake_warehouse.bi.name
  }
}

resource "snowflake_grant_privileges_to_account_role" "dev_warehouse" {
  privileges        = ["USAGE", "OPERATE"]
  account_role_name = snowflake_account_role.developer.name
  on_account_object {
    object_type = "WAREHOUSE"
    object_name = snowflake_warehouse.dev.name
  }
}
```

---

## Authentication: Key-Pair Setup

Prefer key-pair authentication for service accounts. Never use password auth in production.

### Generate RSA key pair

```bash
# Generate encrypted private key
openssl genrsa 2048 | openssl pkcs8 -topk8 -inform PEM -out rsa_key.p8 -nocrypt

# Extract public key
openssl rsa -in rsa_key.p8 -pubout -out rsa_key.pub
```

### Assign public key to Snowflake user

```hcl
resource "snowflake_user" "terraform_svc" {
  name         = "TERRAFORM_SVC"
  login_name   = "TERRAFORM_SVC"
  comment      = "Service account for Terraform automation"
  rsa_public_key = file("${path.module}/keys/rsa_key.pub")

  default_role      = snowflake_account_role.analytics_admin.name
  default_warehouse = snowflake_warehouse.dev.name
}
```

### Grant roles to service account

```hcl
resource "snowflake_grant_account_role" "svc_analytics_admin" {
  role_name = snowflake_account_role.analytics_admin.name
  user_name = snowflake_user.terraform_svc.name
}
```

---

## Common Terraform Patterns

### Use variables for environment-specific configuration

```hcl
variable "environment" {
  type        = string
  description = "Deployment environment (dev, staging, prod)"
  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be dev, staging, or prod."
  }
}

variable "snowflake_organization_name" {
  type        = string
  description = "Snowflake organization name"
}

variable "snowflake_account_name" {
  type        = string
  description = "Snowflake account name"
}

variable "snowflake_user" {
  type        = string
  description = "Snowflake user for Terraform provider"
}

variable "warehouse_sizes" {
  type = map(string)
  default = {
    dev     = "XSMALL"
    staging = "SMALL"
    prod    = "MEDIUM"
  }
}

resource "snowflake_warehouse" "etl" {
  name           = "${upper(var.environment)}_ETL_WH"
  warehouse_size = var.warehouse_sizes[var.environment]
  auto_suspend   = 60
  auto_resume    = true
}
```

### Use modules for repeatable patterns

```hcl
# modules/schema_with_grants/main.tf
variable "database_name" { type = string }
variable "schema_name"   { type = string }
variable "reader_role"   { type = string }
variable "writer_role"   { type = string }

resource "snowflake_schema" "this" {
  database = var.database_name
  name     = var.schema_name
}

resource "snowflake_grant_privileges_to_account_role" "reader" {
  privileges        = ["USAGE"]
  account_role_name = var.reader_role
  on_schema {
    schema_name = "\"${var.database_name}\".\"${snowflake_schema.this.name}\""
  }
}

resource "snowflake_grant_privileges_to_account_role" "writer" {
  privileges        = ["USAGE", "CREATE TABLE", "CREATE VIEW"]
  account_role_name = var.writer_role
  on_schema {
    schema_name = "\"${var.database_name}\".\"${snowflake_schema.this.name}\""
  }
}

resource "snowflake_grant_privileges_to_account_role" "future_select" {
  privileges        = ["SELECT"]
  account_role_name = var.reader_role
  on_schema_object {
    future {
      object_type_plural = "TABLES"
      in_schema          = "\"${var.database_name}\".\"${snowflake_schema.this.name}\""
    }
  }
}
```

### Import existing resources

```bash
# Import an existing warehouse into Terraform state
terraform import snowflake_warehouse.etl '"ETL_WH"'

# Import an existing database
terraform import snowflake_database.analytics '"ANALYTICS"'

# Import an existing role
terraform import snowflake_account_role.analytics_reader '"ANALYTICS_READER"'
```

### Lifecycle management

```hcl
resource "snowflake_database" "analytics" {
  name = "ANALYTICS"

  lifecycle {
    # Prevent accidental database deletion
    prevent_destroy = true
  }
}

resource "snowflake_warehouse" "etl" {
  name           = "ETL_WH"
  warehouse_size = "MEDIUM"

  lifecycle {
    # Ignore size changes made manually in console
    ignore_changes = [warehouse_size]
  }
}
```
