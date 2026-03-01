# Terraform Reference

Infrastructure-as-code patterns for Databricks using the official Terraform provider.

## Provider Setup

### Authentication with Service Principal

Always authenticate with a service principal. Never use personal access tokens in Terraform configurations.

```hcl
# providers.tf
terraform {
  required_providers {
    databricks = {
      source  = "databricks/databricks"
      version = "~> 1.50"
    }
  }

  # Remote state backend is mandatory for team workflows
  backend "azurerm" {
    resource_group_name  = "terraform-state-rg"
    storage_account_name = "tfstatedatabricks"
    container_name       = "tfstate"
    key                  = "databricks/terraform.tfstate"
  }
}

# Authenticate via environment variables (never inline)
provider "databricks" {
  host = var.databricks_host
  # Token, client_id, and client_secret come from environment variables:
  # DATABRICKS_TOKEN or DATABRICKS_CLIENT_ID + DATABRICKS_CLIENT_SECRET
}
```

### Environment Variables

Set these in CI/CD or local shell. Never commit them to version control.

```bash
# Service principal authentication (recommended)
export DATABRICKS_HOST="https://adb-1234567890.12.azuredatabricks.net"
export DATABRICKS_CLIENT_ID="00000000-0000-0000-0000-000000000000"
export DATABRICKS_CLIENT_SECRET="your-client-secret"

# Or personal access token (development only)
export DATABRICKS_HOST="https://adb-1234567890.12.azuredatabricks.net"
export DATABRICKS_TOKEN="dapi1234567890abcdef"
```

### AWS Backend Alternative

```hcl
backend "s3" {
  bucket         = "terraform-state-databricks"
  key            = "databricks/terraform.tfstate"
  region         = "us-east-1"
  dynamodb_table = "terraform-locks"
  encrypt        = true
}
```

## .gitignore for Terraform

Add these entries to prevent committing state files and credentials.

```gitignore
# Terraform state (contains secrets and sensitive data)
*.tfstate
*.tfstate.backup
*.tfstate.*.backup
.terraform/
.terraform.lock.hcl

# Variable files that may contain secrets
*.tfvars
*.tfvars.json
!example.tfvars

# Crash logs
crash.log
crash.*.log

# Override files
override.tf
override.tf.json
*_override.tf
*_override.tf.json

# Environment files
.env
.env.*
```

## Workspace Resources

### Cluster Definitions

```hcl
# clusters.tf
resource "databricks_cluster" "shared_analytics" {
  cluster_name            = "shared-analytics"
  spark_version           = data.databricks_spark_version.latest_lts.id
  node_type_id            = data.databricks_node_type.smallest.id
  autotermination_minutes = 30
  num_workers             = 0  # Single node for development

  autoscale {
    min_workers = 1
    max_workers = 8
  }

  spark_conf = {
    "spark.databricks.cluster.profile" = "singleNode"
    "spark.master"                     = "local[*, 4]"
  }

  custom_tags = {
    "Team"        = "data-engineering"
    "Environment" = var.environment
    "ManagedBy"   = "terraform"
  }
}

# Look up latest LTS runtime
data "databricks_spark_version" "latest_lts" {
  long_term_support = true
}

# Look up smallest available node type
data "databricks_node_type" "smallest" {
  local_disk = true
}
```

### Cluster Policies

Restrict cluster configurations to control cost and enforce standards.

```hcl
resource "databricks_cluster_policy" "data_engineering" {
  name = "Data Engineering Policy"

  definition = jsonencode({
    "node_type_id" : {
      "type" : "allowlist",
      "values" : [
        "Standard_DS3_v2",
        "Standard_DS4_v2",
        "Standard_DS5_v2"
      ]
    },
    "autotermination_minutes" : {
      "type" : "range",
      "minValue" : 10,
      "maxValue" : 120,
      "defaultValue" : 30
    },
    "num_workers" : {
      "type" : "range",
      "minValue" : 1,
      "maxValue" : 20
    },
    "spark_version" : {
      "type" : "regex",
      "pattern" : ".*-scala2\\.12$"
    },
    "custom_tags.Team" : {
      "type" : "fixed",
      "value" : "data-engineering"
    }
  })
}

# Assign policy permissions
resource "databricks_permissions" "policy_usage" {
  cluster_policy_id = databricks_cluster_policy.data_engineering.id

  access_control {
    group_name       = "data-engineers"
    permission_level = "CAN_USE"
  }
}
```

### Job Definitions

```hcl
resource "databricks_job" "daily_etl" {
  name = "daily-etl-pipeline"

  schedule {
    quartz_cron_expression = "0 0 6 * * ?"
    timezone_id            = "UTC"
  }

  job_cluster {
    job_cluster_key = "etl_cluster"

    new_cluster {
      spark_version = data.databricks_spark_version.latest_lts.id
      node_type_id  = "Standard_DS4_v2"
      num_workers   = 4

      spark_conf = {
        "spark.sql.adaptive.enabled" = "true"
      }

      custom_tags = {
        "Job"         = "daily-etl"
        "Environment" = var.environment
        "ManagedBy"   = "terraform"
      }
    }
  }

  task {
    task_key = "extract"

    notebook_task {
      notebook_path = "/Repos/production/etl/extract"
      base_parameters = {
        "date" = "{{job.trigger_time.iso_date}}"
      }
    }

    job_cluster_key = "etl_cluster"
  }

  task {
    task_key = "transform"
    depends_on {
      task_key = "extract"
    }

    notebook_task {
      notebook_path = "/Repos/production/etl/transform"
    }

    job_cluster_key = "etl_cluster"
  }

  task {
    task_key = "validate"
    depends_on {
      task_key = "transform"
    }

    notebook_task {
      notebook_path = "/Repos/production/etl/validate"
    }

    job_cluster_key = "etl_cluster"
  }

  email_notifications {
    on_failure = ["data-alerts@example.com"]
  }

  tags = {
    "Pipeline"    = "daily-etl"
    "Environment" = var.environment
  }
}
```

### Notebook and Repo Management

```hcl
# Git repo integration
resource "databricks_repo" "production" {
  url    = "https://github.com/org/databricks-pipelines.git"
  path   = "/Repos/production"
  branch = "main"
}

# Notebook from file
resource "databricks_notebook" "setup" {
  path     = "/Shared/setup/init_notebook"
  language = "PYTHON"
  source   = "${path.module}/notebooks/init_notebook.py"
}
```

## Unity Catalog Resources

### Catalog and Schema

```hcl
resource "databricks_catalog" "prod" {
  name    = "prod"
  comment = "Production data catalog"

  properties = {
    "environment" = "production"
    "managed_by"  = "terraform"
  }
}

resource "databricks_schema" "raw" {
  catalog_name = databricks_catalog.prod.name
  name         = "raw"
  comment      = "Raw ingestion layer"

  properties = {
    "team" = "data-engineering"
  }
}

resource "databricks_schema" "curated" {
  catalog_name = databricks_catalog.prod.name
  name         = "curated"
  comment      = "Curated business entities"

  properties = {
    "team" = "data-engineering"
    "sla"  = "tier-1"
  }
}
```

### Grants

```hcl
resource "databricks_grants" "catalog_prod" {
  catalog = databricks_catalog.prod.name

  grant {
    principal  = "data-engineers"
    privileges = ["USE_CATALOG", "CREATE_SCHEMA"]
  }

  grant {
    principal  = "data-analysts"
    privileges = ["USE_CATALOG"]
  }
}

resource "databricks_grants" "schema_curated" {
  schema = "${databricks_catalog.prod.name}.${databricks_schema.curated.name}"

  grant {
    principal  = "data-engineers"
    privileges = ["CREATE_TABLE", "MODIFY"]
  }

  grant {
    principal  = "data-analysts"
    privileges = ["USE_SCHEMA", "SELECT"]
  }
}
```

### External Locations

```hcl
resource "databricks_storage_credential" "azure_cred" {
  name = "azure-prod-storage"

  azure_managed_identity {
    access_connector_id = var.access_connector_id
  }

  comment = "Managed identity for production storage"
}

resource "databricks_external_location" "raw_landing" {
  name            = "raw-landing"
  url             = "abfss://raw-landing@${var.storage_account}.dfs.core.windows.net/"
  credential_name = databricks_storage_credential.azure_cred.name
  comment         = "Landing zone for raw data ingestion"
}

resource "databricks_grants" "external_location_raw" {
  external_location = databricks_external_location.raw_landing.id

  grant {
    principal  = "data-engineers"
    privileges = ["CREATE_EXTERNAL_TABLE", "READ_FILES", "WRITE_FILES"]
  }
}
```

## Secret Management

Use Databricks secret scopes. Never store secrets in Terraform state or variables files.

```hcl
# Create a secret scope backed by Databricks
resource "databricks_secret_scope" "app_secrets" {
  name = "app-secrets"
}

# Create a secret scope backed by Azure Key Vault
resource "databricks_secret_scope" "keyvault" {
  name = "keyvault-secrets"

  keyvault_metadata {
    resource_id = var.keyvault_resource_id
    dns_name    = var.keyvault_dns_name
  }
}

# Store a secret (value comes from environment variable, not hardcoded)
resource "databricks_secret" "api_key" {
  scope        = databricks_secret_scope.app_secrets.name
  key          = "external-api-key"
  string_value = var.external_api_key  # Passed via TF_VAR_external_api_key env var
}

# Grant access to secret scope
resource "databricks_secret_acl" "app_secrets_read" {
  scope      = databricks_secret_scope.app_secrets.name
  principal  = "data-engineers"
  permission = "READ"
}
```

Access secrets in notebooks:

```python
# Read secret in a notebook (never print or log the value)
api_key = dbutils.secrets.get(scope="app-secrets", key="external-api-key")
```

## Variables and Outputs

```hcl
# variables.tf
variable "databricks_host" {
  description = "Databricks workspace URL"
  type        = string
}

variable "environment" {
  description = "Deployment environment"
  type        = string
  default     = "dev"

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be dev, staging, or prod."
  }
}

variable "external_api_key" {
  description = "API key for external service (pass via TF_VAR_external_api_key)"
  type        = string
  sensitive   = true
}

variable "storage_account" {
  description = "Azure storage account name"
  type        = string
}

variable "access_connector_id" {
  description = "Azure Databricks access connector resource ID"
  type        = string
}

variable "keyvault_resource_id" {
  description = "Azure Key Vault resource ID for secret scope"
  type        = string
  default     = ""
}

variable "keyvault_dns_name" {
  description = "Azure Key Vault DNS name"
  type        = string
  default     = ""
}
```

```hcl
# outputs.tf
output "workspace_url" {
  description = "Databricks workspace URL"
  value       = var.databricks_host
}

output "catalog_name" {
  description = "Production catalog name"
  value       = databricks_catalog.prod.name
}

output "etl_job_id" {
  description = "Daily ETL job ID"
  value       = databricks_job.daily_etl.id
}
```

## Common Patterns

### Multi-Environment with Workspaces

```hcl
# Use Terraform workspaces or separate tfvars per environment
# terraform workspace select prod
# terraform apply -var-file="environments/prod.tfvars"

locals {
  env_config = {
    dev = {
      cluster_max_workers = 4
      job_schedule        = null  # Manual trigger only
    }
    staging = {
      cluster_max_workers = 8
      job_schedule        = "0 0 6 * * ?"
    }
    prod = {
      cluster_max_workers = 20
      job_schedule        = "0 0 6 * * ?"
    }
  }

  config = local.env_config[var.environment]
}
```

### Import Existing Resources

```bash
# Import an existing cluster
terraform import databricks_cluster.shared_analytics <cluster-id>

# Import an existing job
terraform import databricks_job.daily_etl <job-id>

# Import an existing catalog
terraform import databricks_catalog.prod prod
```

### State Management Best Practices

- Always use a remote state backend (S3, Azure Blob, GCS)
- Enable state locking (DynamoDB for S3, built-in for Azure Blob)
- Never commit `*.tfstate` files to version control
- Use `terraform plan` before every `apply`
- Mark sensitive variables with `sensitive = true` to prevent state exposure in logs
- Run `terraform fmt` and `terraform validate` in CI before merge
