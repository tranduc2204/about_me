/* ==========================================================================
   EDITORIAL THEME & MARK PHAM BLUEPRINT CANVAS JAVASCRIPT
   Author: Trần Đức (Dustin) — Analytics Engineer
   ========================================================================== */

// --- 1. MULTI-ARCHITECTURE DATA STORE (How My Data Flows) ---
const ARCHITECTURES = {
  adventureworks: {
    id: "adventureworks",
    name: "AdventureWorks Platform (Production)",
    subtitle: "Enterprise ELT platform with SQL Server CDC, dlt (Python), Snowflake Bronze/Gold, dbt Core Kimball modeling and Metabase BI.",
    sources: [
      {
        id: "sqlserver",
        title: "SQL Server 2022",
        sub: "Docker • OLTP CDC Enabled",
        icon: "🗄️",
        stage: "01 // SOURCE",
        role: "OLTP Database System",
        desc: "Hệ quản trị CSDL quan hệ mô phỏng vận hành bán lẻ doanh nghiệp trên Docker. Kích hoạt SQL Server Agent và Change Data Capture (CDC) trên bảng bán hàng để ghi vết transaction log thời gian thực.",
        code: `# Docker container với SQL Server Agent kích hoạt
docker run -d --name sqlserver2022 -p 1433:1433 -e "ACCEPT_EULA=Y" \
  -e "MSSQL_SA_PASSWORD=..." -e "MSSQL_AGENT_ENABLED=true" \
  mcr.microsoft.com/mssql/server:2022-latest

-- Kích hoạt CDC cấp Database và Table
EXEC sys.sp_cdc_enable_db;
EXEC sys.sp_cdc_enable_table @source_schema = N'dbo', @source_name = N'sales', @role_name = NULL, @supports_net_changes = 1;`
      },
      {
        id: "sales_stream",
        title: "Sales Orders (23.9k)",
        sub: "Transactions Stream • CDC Log",
        icon: "🛒",
        stage: "01 // SOURCE",
        role: "Incremental Sales Stream",
        desc: "Dòng giao dịch bán lẻ phát sinh liên tục (23,935 đơn hàng lịch sử) được theo dõi qua bảng hệ thống cdc.dbo_sales_CT với Log Sequence Number (__$start_lsn).",
        code: `-- Truy vấn kiểm tra CDC log trên SQL Server
SELECT [__$start_lsn], [__$seqval], [__$operation], order_number, order_line_item, order_quantity, unit_price
FROM cdc.dbo_sales_CT
WHERE [__$operation] IN (2, 4); -- 2=Insert, 4=Update After`
      },
      {
        id: "dims",
        title: "Customer & Product Dims",
        sub: "Master Data Tables",
        icon: "👥",
        stage: "01 // SOURCE",
        role: "Master Data Entities",
        desc: "Dữ liệu danh mục khách hàng (nhân khẩu học, thu nhập), danh mục sản phẩm (giá vốn, giá niêm yết) và danh mục đại lý kinh doanh.",
        code: `SELECT customer_key, first_name, last_name, email_address, annual_income, total_children
FROM dbo.customers;`
      },
      {
        id: "refs",
        title: "Returns & Territories",
        sub: "Reference & Geography",
        icon: "🗺️",
        stage: "01 // SOURCE",
        role: "Reference Dimension Tables",
        desc: "Bảng dữ liệu phân vùng địa lý kinh doanh (Territory Key, Country, Region) và bảng ghi nhận sản phẩm hoàn trả phục vụ tính toán Net Margin.",
        code: `SELECT return_date, territory_key, product_key, return_quantity
FROM dbo.returns;`
      }
    ],
    ingestion: {
      id: "dlt_cdc",
      title: "dlt (Python) + CDC",
      sub: "Managed connectors / ELT",
      tag: "CDC by LSN (Log Sequence)",
      icon: "🐍",
      badge: "ENGINE",
      stage: "02 // INGESTION",
      role: "Change Data Capture Streaming Engine",
      desc: "Thư viện Python dlt (data load tool) áp dụng incremental cursor dựa trên Log Sequence Number (__$start_lsn) để nạp append-only vào Snowflake Bronze. Xác thực bảo mật chuẩn Enterprise qua RSA Key-Pair.",
      code: `# Incremental Cursor Streaming by LSN qua dlt framework
source = sql_database(credentials="mssql+pyodbc://...", schema="cdc")
source.resources["dbo_sales_CT"].apply_hints(
    incremental=dlt.sources.incremental(
        '"__$start_lsn"',
        initial_value=b"\\x00" * 10
    )
)
pipeline = dlt.pipeline(pipeline_name="adv_cdc", destination="snowflake", dataset_name="bronze")
pipeline.run(source.with_resources("dbo_sales_CT"), write_disposition="append")`
    },
    lake: {
      id: "snowflake_bronze",
      title: "Snowflake BRONZE",
      sub: "Raw archive / append-only logs",
      icon: "🪣",
      badge: "LAKE",
      stage: "03 // LAKE",
      role: "Immutable Raw Data Lake",
      desc: "Schema BRONZE trong Snowflake đóng vai trò kho lưu trữ thô bất biến (Immutable Append-only). Bảo toàn 100% lịch sử giao dịch và vết thay đổi để phục vụ kiểm toán hoặc replay dữ liệu khi cần.",
      code: `CREATE SCHEMA IF NOT EXISTS ADVENTUREWORKS.BRONZE;
-- Bảng raw lưu trữ append-only do dlt tự động quản lý schema
SELECT COUNT(*) FROM ADVENTUREWORKS.BRONZE.DBO_SALES_CT;`
    },
    load: {
      id: "copy_into",
      title: "COPY INTO",
      sub: "RSA Key-Pair external stages",
      icon: "⚡",
      badge: "LOAD",
      stage: "04 // LOAD",
      role: "Secure Enterprise Ingestion",
      desc: "Sử dụng câu lệnh COPY INTO tối ưu của Snowflake kết hợp xác thực mã hóa khóa công khai RSA 2048-bit cho tài khoản dịch vụ DLT_USER. Tuân thủ nguyên tắc đặc quyền tối thiểu (Least Privilege).",
      code: `-- Cấu hình xác thực RSA Key-Pair cho user nạp dữ liệu
ALTER USER DLT_USER SET RSA_PUBLIC_KEY = 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...';
GRANT ROLE INGESTION_ROLE TO USER DLT_USER;
GRANT USAGE ON WAREHOUSE COMPUTE_WH TO ROLE INGESTION_ROLE;`
    },
    transform: {
      header: "Snowflake + dbt",
      subnodes: [
        {
          id: "gold_schema",
          title: "Snowflake Gold",
          sub: "raw • analytics schemas",
          stage: "05 // WAREHOUSE",
          role: "Cloud Data Warehouse Serving Layer",
          desc: "Tách bạch vật lý giữa schema BRONZE (raw), BRONZE_STAGING (dbt views) và GOLD (Kimball Star Schema) tối ưu hóa truy vấn và tiết kiệm chi phí tính toán.",
          code: `CREATE SCHEMA IF NOT EXISTS ADVENTUREWORKS.GOLD;
GRANT USAGE ON SCHEMA ADVENTUREWORKS.GOLD TO ROLE REPORTING_ROLE;`
        },
        {
          id: "dbt_models",
          title: "dbt models",
          sub: "stg → cdc deduplication → marts",
          stage: "05 // TRANSFORM",
          role: "CDC Deduplication & Data Marts",
          desc: "Sử dụng Window Function ROW_NUMBER() qua _start_lsn trong dbt staging để loại bỏ bản ghi UPDATE_BEFORE (operation=3) và lấy event mới nhất cho mỗi đơn hàng. Triển khai Incremental Merge trên Fact Sales.",
          code: `-- Deduplication CDC events trong models/staging/src_cdc_sales.sql
SELECT * EXCLUDE (rn) FROM (
  SELECT *,
    ROW_NUMBER() OVER (
      PARTITION BY order_number, order_line_item 
      ORDER BY _start_lsn DESC, _seqval DESC
    ) AS rn
  FROM {{ source('bronze', 'dbo_sales_ct') }}
  WHERE _operation != 3
) WHERE rn = 1;`
        },
        {
          id: "dbt_tests",
          title: "dbt CI/CD & Tests",
          sub: "30 tests passed • PR checks • dbt build ✓",
          stage: "05 // CI/CD",
          role: "Automated Data Quality Suite",
          desc: "Bộ 30 test cases tự động (unique, not_null, referential integrity relationships, singular custom assertions) chạy tự động trong CI/CD trước khi triển khai production.",
          code: `- name: fct_sales
  columns:
    - name: sales_key
      tests: [unique, not_null]
    - name: customer_key
      tests:
        - relationships:
            to: ref('dim_customers')
            field: customer_key`
        },
        {
          id: "scd2",
          title: "SCD Type 2",
          sub: "snap_products historical changes",
          stage: "05 // MODELING",
          role: "Slowly Changing Dimension Type 2",
          desc: "dbt Snapshot ghi vết lịch sử thay đổi giá bán sản phẩm (dbt_valid_from, dbt_valid_to). Đảm bảo báo cáo doanh thu tài chính nhân đúng mức giá tại chính xác ngày bán hàng.",
          code: `{% snapshot snap_products %}
{{ config(
    target_schema='gold',
    unique_key='product_key',
    strategy='check',
    check_cols=['product_price', 'product_cost']
) }}
SELECT product_key, product_name, product_price, product_cost FROM {{ ref('stg_products') }}
{% endsnapshot %}`
        }
      ]
    },
    consumers: [
      {
        id: "metabase",
        title: "Metabase BI",
        sub: "Interactive Dashboards • 12 KPIs",
        icon: "📊",
        stage: "06 // CONSUMER",
        role: "Self-Service Business Intelligence",
        desc: "Bảng điều khiển trực quan hóa kết nối trực tiếp vào schema GOLD. Cung cấp 12 chỉ số KPI: Doanh thu thuần, Tỷ lệ hoàn hàng theo khu vực, Biên lợi nhuận gộp và Tăng trưởng MoM.",
        code: `SELECT 
  c.year, c.month_name, p.category_name,
  SUM(s.order_quantity * p.product_price) AS net_revenue
FROM gold.fct_sales s
JOIN gold.dim_calendar c ON s.order_date_key = c.date_key
JOIN gold.dim_products p ON s.product_key = p.product_key
WHERE s.is_deleted = FALSE
GROUP BY 1, 2, 3 ORDER BY 1 DESC;`
      },
      {
        id: "stakeholders",
        title: "Business Stakeholders",
        sub: "Automated Daily Reports",
        icon: "👔",
        stage: "06 // CONSUMER",
        role: "Executive Decision Makers",
        desc: "Báo cáo đối soát tự động gửi tới Ban Giám Đốc và Bộ phận Kế toán lúc 8:00 sáng mỗi ngày, đảm bảo số liệu kinh doanh đúng 100% và không có độ trễ.",
        code: `-- Trigger automated executive notification payload
{"report": "Daily_Executive_Sales_Audit", "status": "RECONCILED", "discrepancy": 0.00}`
      }
    ],
    orchestration: {
      tool: "Airflow Orchestration",
      caption: "schedules ingestion • CDC change tracking • dbt runs • data-quality checks • CI/CD",
      legend: "solid = primary flow • dashed = direct snapshot load"
    }
  },

  erp: {
    id: "erp",
    name: "Enterprise ERP BRAVO (THACO / Lộc Phúc)",
    subtitle: "Mission-critical on-premises ERP architecture: Stored procedures, FIFO costing, audit reconciliation and executive accounting cubes.",
    sources: [
      {
        id: "bravo_sql",
        title: "BRAVO 8 SQL Server",
        sub: "On-Premises OLTP Database",
        icon: "🏭",
        stage: "01 // SOURCE",
        role: "Core ERP Database Server",
        desc: "Cơ sở dữ liệu Microsoft SQL Server vận hành phân hệ Mua hàng, Kho, Kế toán tại THACO và Lộc Phúc Jewelry. Quản lý hàng trăm nghìn chứng từ vật tư và theo dõi từng gram vàng.",
        code: `-- Truy vấn chứng từ nhập xuất kho vật tư trong ngày
SELECT VoucherNo, VoucherDate, WarehouseCode, ItemCode, Quantity, UnitPrice
FROM dbo.B20VoucherDetail 
WHERE VoucherDate = CAST(GETDATE() AS DATE);`
      },
      {
        id: "purchasing",
        title: "Purchasing & POs",
        sub: "Phân hệ Đơn Hàng Mua",
        icon: "📑",
        stage: "01 // SOURCE",
        role: "Procurement & Vendor POs",
        desc: "Theo dõi luồng phê duyệt đơn đặt mua linh kiện ô tô với các nhà cung cấp quốc tế, kiểm soát giá mua và tiến độ giao hàng về các nhà máy lắp ráp.",
        code: `SELECT PoNumber, VendorCode, OrderDate, DeliveryDate, TotalAmount, ApprovalStatus
FROM dbo.B20PurchasingOrder;`
      },
      {
        id: "inventory",
        title: "Inventory & Warehouses",
        sub: "Kho Phụ Tùng & Kim Hoàn",
        icon: "📦",
        stage: "01 // SOURCE",
        role: "Warehouse & Material Tracking",
        desc: "Quản lý tồn kho theo phương pháp FIFO. Tại Lộc Phúc Jewelry, kiểm soát định mức hao hụt vàng qua các công đoạn đúc, nấu, đánh bóng chính xác đến 0.01 gram.",
        code: `EXEC dbo.sp_CalculateArtisanLoss @ArtisanId = 1042, @WorkOrderId = 8891;`
      },
      {
        id: "gl",
        title: "General Ledger & GL",
        sub: "Sổ Cái Kế Toán Doanh Nghiệp",
        icon: "💰",
        stage: "01 // SOURCE",
        role: "Financial & Accounting Ledger",
        desc: "Hạch toán định khoản kế toán kép (Nợ/Có), cân đối tài khoản đối soát công nợ liên công ty giữa các đơn vị thành viên.",
        code: `SELECT AccountCode, DebitAmount, CreditAmount, CurrencyCode
FROM dbo.B20GeneralLedger;`
      }
    ],
    ingestion: {
      id: "ssis_python",
      title: "SSIS & Python Scripts",
      sub: "Batch Replication & Change Tracking",
      tag: "Scheduled Delta Sync",
      icon: "⚙️",
      badge: "BATCH ETL",
      stage: "02 // INGESTION",
      role: "Enterprise Batch ETL Pipeline",
      desc: "Trích xuất gia tăng (Delta Ingestion) ngoài giờ hành chính bằng SSIS packages và Python để tránh tình trạng Exclusive Table Locks trên máy chủ ERP sản xuất.",
      code: `python erp_sync/extract_delta.py --table B20VoucherDetail --watermark "2026-03-20 18:00:00"`
    },
    lake: {
      id: "ods_lake",
      title: "ODS Staging Server",
      sub: "Operational Data Store",
      icon: "💾",
      badge: "STAGING",
      stage: "03 // LAKE",
      role: "Operational Data Store (ODS)",
      desc: "Máy chủ lưu trữ trung gian chứa bản sao dữ liệu phát sinh trong ngày, giảm thiểu 100% gánh nặng truy vấn báo cáo lên máy chủ ERP chính.",
      code: `CREATE DATABASE ERP_ODS;
-- Staging tables with bulk insert logging`
    },
    load: {
      id: "tsql_merge",
      title: "T-SQL MERGE",
      sub: "Atomic Stored Procedures",
      icon: "🔄",
      badge: "MERGE",
      stage: "04 // LOAD",
      role: "Atomic Upsert Procedure",
      desc: "Stored Procedure sử dụng câu lệnh MERGE với kiểm soát Transaction Isolation Level Snapshot để nạp gia tăng vào Data Warehouse mà không gây nghẽn deadlock.",
      code: `MERGE INTO DW.FactInventory AS target
USING ODS.StageInventory AS source
ON (target.TransactionId = source.TransactionId)
WHEN MATCHED THEN UPDATE SET ...
WHEN NOT MATCHED THEN INSERT ...;`
    },
    transform: {
      header: "Enterprise Data Warehouse",
      subnodes: [
        {
          id: "dw_star",
          title: "SQL Server EDW",
          sub: "Star Schema & Financial Marts",
          stage: "05 // WAREHOUSE",
          role: "Enterprise Data Warehouse",
          desc: "Mô hình hóa hình sao Kimball tập trung: Fact Sales, Fact Inventory Movement và Fact General Ledger cho toàn bộ các chi nhánh.",
          code: `SELECT * FROM EDW.FactPurchasing WHERE FiscalYear = 2026;`
        },
        {
          id: "fifo_calc",
          title: "FIFO Costing Engine",
          sub: "Định giá xuất kho tự động",
          stage: "05 // TRANSFORM",
          role: "Automated Valuation Logic",
          desc: "Động cơ tính toán giá vốn xuất kho theo phương pháp FIFO và đích danh cho từng lô hàng vàng bạc kim hoàn và phụ tùng ô tô.",
          code: `EXEC dbo.sp_RunMonthlyFIFOCosting @ClosingDate = '2026-03-31';`
        },
        {
          id: "audit_trail",
          title: "Reconciliation Audit",
          sub: "Đối soát tự động 100% khớp",
          stage: "05 // AUDIT",
          role: "Financial Reconciliation Engine",
          desc: "Đối soát tự động giữa số dư sổ phụ ngân hàng, tồn kho thực tế và sổ cái kế toán; lập tức gửi cảnh báo nếu có chênh lệch dù chỉ 1 đồng.",
          code: `SELECT DiscrepancyAmount FROM EDW.Audit_BalanceCheck WHERE DiscrepancyAmount != 0;`
        },
        {
          id: "ssas_cubes",
          title: "SSAS Tabular Cubes",
          sub: "In-Memory Semantic Models",
          stage: "05 // SEMANTIC",
          role: "In-Memory Analytical Cubes",
          desc: "Mô hình Tabular SSAS nạp in-memory, phục vụ hàng chục giám đốc tài chính cắt lát dữ liệu doanh thu và chi phí trong tích tắc.",
          code: `EVALUATE SUMMARIZECOLUMNS('Calendar'[FiscalMonth], "Net Margin", [TotalNetMargin]);`
        }
      ]
    },
    consumers: [
      {
        id: "bodyshop",
        title: "THACO Bodyshop Managers",
        sub: "Tiến độ lắp ráp & tồn kho xe",
        icon: "🚗",
        stage: "06 // CONSUMER",
        role: "Plant Operations Management",
        desc: "Ban giám đốc xưởng sản xuất và trạm dịch vụ theo dõi tiến độ hoàn thiện xe, định mức vật tư phụ tùng tiêu hao.",
        code: `SELECT WorkshopId, DailyThroughput, PartsAvailabilityRate FROM EDW.V_BodyshopKPIs;`
      },
      {
        id: "jewelry_board",
        title: "Lộc Phúc Executive Board",
        sub: "Báo cáo hao hụt & doanh số kim hoàn",
        icon: "💎",
        stage: "06 // CONSUMER",
        role: "C-Level Leadership",
        desc: "Hội đồng quản trị theo dõi doanh số chuỗi showroom bán lẻ và báo cáo tỷ lệ hao hụt vàng qua từng khâu chế tác thủ công.",
        code: `SELECT ShowroomCity, GoldLossRatio, GrossRevenue FROM EDW.V_ExecutiveJewelryReport;`
      }
    ],
    orchestration: {
      tool: "SQL Server Agent + Python Scheduler",
      caption: "schedules nightly batch sync • runs balance reconciliation • triggers executive alerts",
      legend: "solid = nightly sync flow • dashed = direct auditing link"
    }
  },

  spark: {
    id: "spark",
    name: "Big Data Spark Lakehouse",
    subtitle: "High-throughput streaming lakehouse: Kafka, PySpark Structured Streaming, Delta Lake ACID, and real-time operational telemetry.",
    sources: [
      {
        id: "kafka",
        title: "Kafka Event Bus",
        sub: "Telemetry & Clickstream Topics",
        icon: "⚡",
        stage: "01 // SOURCE",
        role: "Distributed Message Broker",
        desc: "Apache Kafka cụm đa node tiếp nhận hàng triệu sự kiện telemetry từ cảm biến IoT giám sát nhiệt độ kho lạnh và clickstream từ ứng dụng khách hàng.",
        code: `kafka-console-producer.sh --bootstrap-server kafka:9092 --topic telemetry-events`
      },
      {
        id: "clickstream",
        title: "IoT & Web Clickstream",
        sub: "High-velocity JSON Events",
        icon: "📱",
        stage: "01 // SOURCE",
        role: "Unstructured Event Ingestion",
        desc: "Dòng dữ liệu bán cấu trúc dạng JSON phát sinh với tần suất hàng nghìn events/giây từ thiết bị thông minh.",
        code: `{"device_id": "IOT-VN-982", "timestamp": 1774028400, "temp_c": 24.5, "status": "OPTIMAL"}`
      },
      {
        id: "s3_raw",
        title: "MinIO / S3 Raw Parquet",
        sub: "Object Storage Bucket",
        icon: "🪣",
        stage: "01 // SOURCE",
        role: "Scalable Cloud Storage",
        desc: "Lưu trữ các tệp thô dạng Parquet và gzip nén, làm hồ chứa dữ liệu dung lượng không giới hạn và chi phí thấp.",
        code: `aws s3 sync s3://company-raw-lake/ /data/lake/`
      },
      {
        id: "crm_db",
        title: "PostgreSQL CRM DB",
        sub: "Customer Records Database",
        icon: "🐘",
        stage: "01 // SOURCE",
        role: "Customer Dimension Source",
        desc: "CSDL khách hàng Postgre được đồng bộ theo cơ chế change-stream để làm giàu dữ liệu telemetry trong luồng streaming.",
        code: `SELECT user_id, tier, signup_date FROM crm.users;`
      }
    ],
    ingestion: {
      id: "spark_stream",
      title: "Spark Structured Streaming",
      sub: "Micro-batch 1s • Delta Lake",
      tag: "Sub-Second Ingestion",
      icon: "🔥",
      badge: "STREAM",
      stage: "02 // INGESTION",
      role: "Stream Processing Engine",
      desc: "PySpark Structured Streaming đọc từ Kafka topics theo micro-batch 1 giây, thực hiện schema validation và ghi thẳng vào Delta Lake Bronze.",
      code: `df = spark.readStream.format("kafka").option("kafka.bootstrap.servers", "kafka:9092").option("subscribe", "telemetry-events").load()
query = df.writeStream.format("delta").outputMode("append").option("checkpointLocation", "/chk/telemetry").start("/lakehouse/bronze")`
    },
    lake: {
      id: "delta_bronze",
      title: "Delta Lake Bronze",
      sub: "ACID Transactions • Open Parquet",
      icon: "🔺",
      badge: "DELTA",
      stage: "03 // LAKE",
      role: "ACID Storage Layer",
      desc: "Delta Lake cung cấp giao dịch ACID, Time-Travel (khôi phục trạng thái lịch sử) và tính năng tự động tối ưu hóa Z-Order clustering trên Parquet.",
      code: `VACUUM delta_bronze RETAIN 168 HOURS;
OPTIMIZE delta_bronze ZORDER BY (device_id, event_date);`
    },
    load: {
      id: "delta_loader",
      title: "Delta Auto Loader",
      sub: "Schema Evolution & Auto-Compact",
      icon: "📦",
      badge: "AUTO LOAD",
      stage: "04 // LOAD",
      role: "Automated File Ingestion",
      desc: "Tự động phát hiện tệp mới trong Object Storage và tự động thích ứng với Schema Evolution khi dữ liệu nguồn phát sinh cột mới.",
      code: `spark.readStream.format("cloudFiles").option("cloudFiles.format", "parquet").load("s3://raw-landing/")`
    },
    transform: {
      header: "PySpark & Delta Engine",
      subnodes: [
        {
          id: "silver_tables",
          title: "Silver Cleansed Tables",
          sub: "Enriched & deduplicated Delta",
          stage: "05 // LAKEHOUSE",
          role: "Cleaned & Conformed Layer",
          desc: "Tầng dữ liệu được làm sạch: loại bỏ bản ghi lỗi (bad records), chuẩn hóa kiểu dữ liệu và làm giàu thông tin người dùng từ Postgre CRM.",
          code: `silver_df = bronze_df.filter("temp_c IS NOT NULL").dropDuplicates(["device_id", "timestamp"])`
        },
        {
          id: "gold_features",
          title: "Gold Feature Store",
          sub: "Aggregated Marts & ML Features",
          stage: "05 // TRANSFORM",
          role: "Analytical Feature Store",
          desc: "Tính toán trước các chỉ số thống kê (Moving Averages, Outlier Scores) phục vụ cả dashboard quản trị và huấn luyện mô hình Machine Learning.",
          code: `gold_df = silver_df.groupBy("device_id").agg(avg("temp_c").alias("mean_temp"), stddev("temp_c").alias("std_temp"))`
        },
        {
          id: "spark_sql_opt",
          title: "Spark SQL Engine",
          sub: "Distributed Query Execution",
          stage: "05 // ENGINE",
          role: "Massive Parallel Processing",
          desc: "Thực thi truy vấn phân tán trên cụm máy chủ Spark với Dynamic Partition Pruning và Vectorized Parquet Readers.",
          code: `SELECT device_id, COUNT(*) FROM delta_silver WHERE event_date = CURRENT_DATE() GROUP BY 1;`
        },
        {
          id: "great_expectations",
          title: "Great Expectations",
          sub: "Automated Data Validation",
          stage: "05 // QUALITY",
          role: "Statistical Quality Gatekeeper",
          desc: "Bộ kiểm soát chất lượng tự động ngăn chặn các batch dữ liệu bất thường (anomaly) trước khi được ghi vào tầng Gold.",
          code: `expect_column_values_to_be_between("temp_c", min_value=-20, max_value=80)`
        }
      ]
    },
    consumers: [
      {
        id: "mlflow",
        title: "MLflow Model Serving",
        sub: "Predictive Maintenance Models",
        icon: "🤖",
        stage: "06 // CONSUMER",
        role: "Machine Learning Serving",
        desc: "Mô hình AI dự báo hỏng hóc thiết bị tiêu thụ trực tiếp feature từ Delta Gold để kích hoạt lệnh bảo trì phòng ngừa trước 48 giờ.",
        code: `predictions = loaded_model.predict(spark_features_df)`
      },
      {
        id: "realtime_dash",
        title: "Realtime Grafana / BI",
        sub: "Sub-minute Latency Dashboards",
        icon: "📈",
        stage: "06 // CONSUMER",
        role: "Real-time Telemetry Monitor",
        desc: "Bảng điều khiển giám sát độ trễ dưới 1 phút, hiển thị tình trạng cảm biến và cảnh báo vượt ngưỡng an toàn nhiệt độ.",
        code: `SELECT timestamp, temp_c FROM delta_gold WHERE device_id = 'IOT-VN-982' ORDER BY timestamp DESC LIMIT 100;`
      }
    ],
    orchestration: {
      tool: "Apache Airflow on Kubernetes",
      caption: "orchestrates streaming micro-batches • runs Delta Lake compaction • schedules ML retraining",
      legend: "solid = streaming data path • dashed = metadata & quality checks"
    }
  }
};

// State
let currentArchKey = "adventureworks";
let currentNodeKey = "dlt_cdc";

// --- 2. RENDER BLUEPRINT CANVAS ---
function renderBlueprintCanvas(archKey) {
  const arch = ARCHITECTURES[archKey];
  if (!arch) return;
  currentArchKey = archKey;

  // 1. Update tab buttons active state
  document.querySelectorAll('.arch-tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.arch === archKey);
  });

  // 2. Render Column 1 (SOURCES)
  const colSources = document.getElementById('bpColSources');
  if (colSources) {
    colSources.innerHTML = `
      <div class="bp-col-header"><span class="num">01 //</span> SOURCES</div>
      ${arch.sources.map(s => `
        <div class="bp-node-pill ${s.id === currentNodeKey ? 'active' : ''}" 
             onclick="inspectSpecificNode('${archKey}', '${s.id}', 'source')"
             data-node-id="${s.id}">
          <div class="bp-node-title"><span>${s.icon}</span> ${s.title}</div>
          <div class="bp-node-sub">${s.sub}</div>
        </div>
      `).join('')}
    `;
  }

  // 3. Render Column 2 (INGESTION / CDC)
  const colIngestion = document.getElementById('bpColIngestion');
  if (colIngestion) {
    const ing = arch.ingestion;
    colIngestion.innerHTML = `
      <div class="bp-col-header"><span class="num">02 //</span> MANAGED INGESTION</div>
      <div class="bp-card ${ing.id === currentNodeKey ? 'active' : ''}" 
           onclick="inspectSpecificNode('${archKey}', '${ing.id}', 'ingestion')"
           data-node-id="${ing.id}">
        <div class="bp-card-top">
          <div class="bp-card-icon" style="background: rgba(16, 185, 129, 0.15); color: #10B981;">${ing.icon}</div>
          <span class="bp-card-badge" style="background: rgba(16, 185, 129, 0.2); color: #10B981;">${ing.badge}</span>
        </div>
        <div class="bp-card-title">${ing.title}</div>
        <div class="bp-card-desc">${ing.sub}</div>
        <div class="bp-pill-tag">${ing.tag}</div>
      </div>
    `;
  }

  // 4. Render Column 3 (LAKE)
  const colLake = document.getElementById('bpColLake');
  if (colLake) {
    const lk = arch.lake;
    colLake.innerHTML = `
      <div class="bp-col-header"><span class="num">03 //</span> LAKE</div>
      <div class="bp-card ${lk.id === currentNodeKey ? 'active' : ''}" 
           onclick="inspectSpecificNode('${archKey}', '${lk.id}', 'lake')"
           data-node-id="${lk.id}">
        <div class="bp-card-top">
          <div class="bp-card-icon" style="background: rgba(56, 189, 248, 0.15); color: #38BDF8;">${lk.icon}</div>
          <span class="bp-card-badge" style="background: rgba(56, 189, 248, 0.2); color: #38BDF8;">${lk.badge}</span>
        </div>
        <div class="bp-card-title">${lk.title}</div>
        <div class="bp-card-desc">${lk.sub}</div>
      </div>
    `;
  }

  // 5. Render Column 4 (LOAD)
  const colLoad = document.getElementById('bpColLoad');
  if (colLoad) {
    const ld = arch.load;
    colLoad.innerHTML = `
      <div class="bp-col-header"><span class="num">04 //</span> LOAD</div>
      <div class="bp-card ${ld.id === currentNodeKey ? 'active' : ''}" 
           onclick="inspectSpecificNode('${archKey}', '${ld.id}', 'load')"
           data-node-id="${ld.id}">
        <div class="bp-card-top">
          <div class="bp-card-icon" style="background: rgba(245, 158, 11, 0.15); color: #F59E0B;">${ld.icon}</div>
          <span class="bp-card-badge" style="background: rgba(245, 158, 11, 0.2); color: #F59E0B;">${ld.badge}</span>
        </div>
        <div class="bp-card-title">${ld.title}</div>
        <div class="bp-card-desc">${ld.sub}</div>
      </div>
    `;
  }

  // 6. Render Column 5 (WAREHOUSE + TRANSFORM)
  const colTransform = document.getElementById('bpColTransform');
  if (colTransform) {
    const tr = arch.transform;
    colTransform.innerHTML = `
      <div class="bp-col-header"><span class="num">05 //</span> WAREHOUSE + TRANSFORM</div>
      <div class="bp-transform-container">
        <div class="bp-transform-header">
          <div class="bp-transform-title">
            <span>❄️ 🦋</span> ${tr.header}
          </div>
          <span class="bp-card-badge" style="background: rgba(139, 92, 246, 0.2); color: #A78BFA;">CORE SYSTEM</span>
        </div>
        <div class="bp-subnode-stack">
          ${tr.subnodes.map(n => `
            <div class="bp-subnode ${n.id === currentNodeKey ? 'active' : ''}" 
                 onclick="inspectSpecificNode('${archKey}', '${n.id}', 'transform')"
                 data-node-id="${n.id}">
              <div class="bp-subnode-title">
                <span>${n.title}</span>
                <span style="font-family: var(--font-mono); font-size: 0.65rem; color: #A78BFA;">${n.stage.split('//')[1]}</span>
              </div>
              <div class="bp-subnode-sub">${n.sub}</div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  // 7. Render Column 6 (CONSUMERS)
  const colConsumers = document.getElementById('bpColConsumers');
  if (colConsumers) {
    colConsumers.innerHTML = `
      <div class="bp-col-header"><span class="num">06 //</span> CONSUMERS</div>
      ${arch.consumers.map(c => `
        <div class="bp-node-pill ${c.id === currentNodeKey ? 'active' : ''}" 
             onclick="inspectSpecificNode('${archKey}', '${c.id}', 'consumer')"
             data-node-id="${c.id}">
          <div class="bp-node-title"><span>${c.icon}</span> ${c.title}</div>
          <div class="bp-node-sub">${c.sub}</div>
        </div>
      `).join('')}
    `;
  }

  // 8. Render Orchestration Bar
  const orchBar = document.getElementById('bpOrchestrationBar');
  if (orchBar) {
    const orch = arch.orchestration;
    orchBar.innerHTML = `
      <div class="bp-orch-left">
        <div class="bp-orch-badge">
          <span>🌀</span> ${orch.tool}
        </div>
      </div>
      <div class="bp-orch-arrow-track">
        <div class="bp-orch-arrow-line"></div>
        <div class="bp-orch-caption">${orch.caption}</div>
      </div>
      <div class="bp-orch-legend">
        <span><span style="width: 16px; height: 2px; background: #38BDF8; display: inline-block;"></span> solid = primary flow</span>
        <span><span style="width: 16px; height: 2px; border-top: 2px dashed #8B5CF6; display: inline-block;"></span> dashed = snapshot/direct</span>
      </div>
    `;
  }

  // Draw or update SVG connector lines
  renderSvgConnections();

  // Inspect default node for this architecture
  const defaultNode = arch.sources[0];
  inspectSpecificNode(archKey, defaultNode.id, 'source');
}

// --- 3. SVG CONNECTOR LINES BETWEEN COLUMNS ---
function renderSvgConnections() {
  const svg = document.getElementById('bpSvgConnectors');
  if (!svg) return;

  // Smooth SVG cubic bezier curves between the 6 column positions
  svg.innerHTML = `
    <defs>
      <linearGradient id="flowGrad" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#38BDF8" stop-opacity="0.6"/>
        <stop offset="50%" stop-color="#8B5CF6" stop-opacity="0.7"/>
        <stop offset="100%" stop-color="#10B981" stop-opacity="0.8"/>
      </linearGradient>
      <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="3" result="blur" />
        <feComposite in="SourceGraphic" in2="blur" operator="over" />
      </filter>
    </defs>

    <!-- Curve: Sources -> Ingestion -->
    <path d="M 190 75 C 215 75, 215 110, 245 110" fill="none" stroke="url(#flowGrad)" stroke-width="2" stroke-dasharray="6,4" opacity="0.7"/>
    <path d="M 190 145 C 215 145, 215 125, 245 125" fill="none" stroke="url(#flowGrad)" stroke-width="2.5" filter="url(#glow)"/>
    <path d="M 190 215 C 215 215, 215 140, 245 140" fill="none" stroke="url(#flowGrad)" stroke-width="2" stroke-dasharray="6,4" opacity="0.7"/>

    <!-- Curve: Ingestion -> Lake -->
    <path d="M 370 125 C 395 125, 395 125, 420 125" fill="none" stroke="url(#flowGrad)" stroke-width="2.5" filter="url(#glow)"/>

    <!-- Curve: Lake -> Load -->
    <path d="M 535 125 C 555 125, 555 125, 575 125" fill="none" stroke="url(#flowGrad)" stroke-width="2.5" filter="url(#glow)"/>

    <!-- Curve: Load -> Warehouse + Transform -->
    <path d="M 685 125 C 705 125, 705 125, 730 125" fill="none" stroke="url(#flowGrad)" stroke-width="2.5" filter="url(#glow)"/>

    <!-- Curve: Transform -> Consumers -->
    <path d="M 960 110 C 985 110, 985 85, 1010 85" fill="none" stroke="url(#flowGrad)" stroke-width="2.5" filter="url(#glow)"/>
    <path d="M 960 160 C 985 160, 985 175, 1010 175" fill="none" stroke="url(#flowGrad)" stroke-width="2" stroke-dasharray="6,4" opacity="0.8"/>
  `;
}

// --- 3B. 2-VARIANT PIPELINE DAG (ELT vs ETL) & INSPECTOR ---
const PIPELINE_NODES = {
  elt: {
    "src-saas": {
      icon: "📢",
      title: "client SaaS apps",
      role: "CRM · Ads · Billing Sources",
      stage: "01 // SOURCES",
      desc: "Tích hợp và trích xuất dữ liệu từ các nền tảng SaaS vận hành doanh nghiệp như CRM (Salesforce, HubSpot), kênh quảng cáo (Google Ads, Meta Ads) và cổng thanh toán (Stripe, Billing). Hỗ trợ schema tự động đồng bộ qua API webhook.",
      code: `# SaaS API Webhook payload ingestion
curl -X POST https://api.fivetran.com/v1/connectors \\
  -H "Authorization: Basic ..." \\
  -d '{
    "service": "salesforce",
    "group_id": "grp_prod_analytics",
    "config": {
      "sync_mode": "incremental_cdc",
      "sync_frequency": 5
    }
  }'`
    },
    "src-databases": {
      icon: "🗄️",
      title: "client databases",
      role: "Production PostgreSQL · MySQL OLTP",
      stage: "01 // SOURCES",
      desc: "Cơ sở dữ liệu giao dịch cốt lõi (PostgreSQL, MySQL). Kích hoạt Change Data Capture (CDC) qua write-ahead log (WAL) hoặc binary log để trích xuất thay đổi thời gian thực mà không làm suy giảm hiệu năng OLTP.",
      code: `-- Kích hoạt Logical Replication trên PostgreSQL
ALTER SYSTEM SET wal_level = 'logical';
ALTER TABLE public.orders REPLICA IDENTITY FULL;

-- Tạo publication cho Change Data Capture (CDC)
CREATE PUBLICATION cdc_publication FOR TABLE public.orders, public.customers;`
    },
    "src-apis": {
      icon: "⌨️",
      title: "client APIs",
      role: "REST APIs & Inbound Webhooks",
      stage: "01 // SOURCES",
      desc: "Thu nhận payload dữ liệu trực tiếp từ các cổng API đối tác bên thứ ba và Webhooks thời gian thực, hỗ trợ xác thực OAuth2/JWT và xử lý giới hạn tần suất (rate-limiting) tự động.",
      code: `# Client API endpoint config with pagination & rate-limit
{
  "api_endpoint": "https://api.partner.io/v2/events",
  "auth_type": "bearer_token",
  "pagination": { "type": "cursor", "cursor_param": "next_page" },
  "retry_policy": { "max_retries": 5, "backoff_multiplier": 2 }
}`
    },
    "src-streams": {
      icon: "⚡",
      title: "event streams",
      role: "Snowplow · Segment Event Streaming",
      stage: "01 // SOURCES",
      desc: "Dòng sự kiện hành vi tương tác của người dùng trên web/app (page views, click events, checkout flow) streaming qua Snowplow và Segment với độ trễ dưới 5 giây, bảo đảm schema tracking chặt chẽ.",
      code: `// Segment Event Stream payload tracking
analytics.track('Order Completed', {
  orderId: 'ORD_2024_9821',
  total: 450.00,
  currency: 'USD',
  products: [{ id: 'SKU_01', name: 'Enterprise License', price: 450.00 }]
});`
    },
    "src-flatfiles": {
      icon: "📄",
      title: "flat files",
      role: "SFTP & Spreadsheet Data Feeds",
      stage: "01 // SOURCES",
      desc: "Các tệp dữ liệu bảng tính (Excel, CSV) và tệp đối soát tài chính từ ngân hàng hoặc nhà cung cấp được định kỳ chuyển tải qua kênh SFTP an toàn hoặc lưu trữ tạm tại Cloud Staging.",
      code: `# SFTP automatic polling script
sftp -i ~/.ssh/id_rsa partner_transfer@sftp.client.com << EOF
cd /exports/daily/
get *.csv /tmp/staging/
bye
EOF`
    },
    "ing-fivetran": {
      icon: "///",
      title: "Fivetran Managed ELT",
      role: "Managed Connectors · Automated ELT · CDC",
      stage: "02 // MANAGED ELT",
      desc: "Nền tảng Managed Ingestion tự động hóa 150+ kết nối nguồn (SaaS, Databases, APIs). Tự động điều chỉnh cấu trúc bảng (automatic schema drift & migration), đồng bộ incremental CDC theo chu kỳ 5 phút và nạp trực tiếp vào Snowflake hoặc S3.",
      code: `# Fivetran Connector Automation Configuration
connector_id: "conn_postgres_cdc"
sync_frequency: 5 # 5-minute batch sync
schema_evolution: "ALLOW_ALL"
destination: "snowflake"
features:
  cdc_mode: "logical_replication"
  auto_resync_on_schema_drift: true`
    },
    "lake-s3": {
      icon: "🪣",
      title: "S3 Lake (Cloud Object Storage)",
      role: "Raw Archive & Daily Partitions",
      stage: "03 // DATA LAKE",
      desc: "Hồ lưu trữ dữ liệu thô bất biến (Immutable Data Lake) trên AWS S3. Toàn bộ bản ghi raw được lưu dưới định dạng Parquet Snappy phân vùng theo ngày (daily partitions) để phục vụ kiểm toán hoặc replay dữ liệu khi cần thiết.",
      code: `# S3 Raw Lake partition path structure
s3://production-data-lake/raw/
  ├── source=salesforce/year=2024/month=09/day=21/data.parquet
  ├── source=postgres_cdc/year=2024/month=09/day=21/data.parquet
  └── source=flat_files/year=2024/month=09/day=21/data.parquet`
    },
    "load-copy": {
      icon: "❄️",
      title: "COPY INTO (Fast Load)",
      role: "S3 → Snowflake External Stages",
      stage: "04 // LOAD",
      desc: "Cơ chế nạp song song tốc độ cao (Fast Load) từ S3 External Stage vào Snowflake raw tables. Hỗ trợ xác thực RSA Key-Pair, cơ chế tự động nhận diện schema và kiểm tra chống trùng lặp tập tin.",
      code: `-- Nạp dữ liệu song song tốc độ cao từ External Stage vào Snowflake
COPY INTO RAW_DB.INGESTION.SALES_STG
FROM @RAW_DB.STAGES.S3_LAKE_STAGE/daily/
FILE_FORMAT = (TYPE = 'PARQUET' COMPRESSION = 'SNAPPY')
ON_ERROR = 'SKIP_FILE'
PURGE = FALSE;`
    },
    "wh-snowflake": {
      icon: "❄️",
      title: "Snowflake DW + dbt Core",
      role: "Warehouse Raw/Analytics Schemas & dbt Kimball Marts",
      stage: "05 // WAREHOUSE + TRANSFORM",
      desc: "Kho dữ liệu Snowflake phân tầng chặt chẽ (raw → staging → intermediate → marts). Sử dụng dbt Core để chuẩn hóa dữ liệu theo mô hình Kimball Star Schema, áp dụng kiểm thử tự động (tests) và quy trình CI/CD kiểm duyệt schema trước khi merge PR.",
      code: `-- models/marts/fct_sales.sql
WITH staged AS (
  SELECT * FROM {{ ref('stg_orders') }}
),
dim_customer AS (
  SELECT * FROM {{ ref('dim_customers') }}
)
SELECT
  s.order_id,
  s.customer_key,
  c.country,
  s.net_amount,
  s.order_timestamp
FROM staged s
LEFT JOIN dim_customer c ON s.customer_key = c.customer_key;`
    },
    "con-omni": {
      icon: "📊",
      title: "Omni BI",
      role: "Next-Gen BI & Interactive Dashboards",
      stage: "06 // CONSUMERS",
      desc: "Nền tảng Business Intelligence thế hệ mới kết nối trực tiếp vào Snowflake marts. Hỗ trợ semantic layer linh hoạt, chia sẻ báo cáo quản trị và cập nhật KPI theo thời gian thực.",
      code: `-- Omni BI semantic layer query on Snowflake Gold Mart
SELECT 
  date_trunc('month', order_date) AS sales_month,
  product_category,
  SUM(net_revenue) AS mrr,
  COUNT(DISTINCT customer_id) AS active_accounts
FROM analytics.marts.fct_revenue
GROUP BY 1, 2
ORDER BY 1 DESC;`
    },
    "con-teams": {
      icon: "✉️",
      title: "Client Teams",
      role: "Embedded Analytics & Self-Serve Access",
      stage: "06 // CONSUMERS",
      desc: "Phục vụ các phòng ban nội bộ và khách hàng đối tác với tính năng phân tích tự phục vụ (Self-serve) và thông báo dữ liệu định kỳ qua Email/Slack.",
      code: `# Automated alerting to Client Teams via Slack Webhook
payload = {
  "channel": "#executive-metrics",
  "text": "📊 Daily Performance Report: MRR reached $124.5k (+14% WoW)."
}
requests.post(SLACK_WEBHOOK_URL, json=payload)`
    },
    "orch-airflow": {
      icon: "🌀",
      title: "Apache Airflow",
      role: "End-to-End Orchestration & Scheduling",
      stage: "BOTTOM // ORCHESTRATION",
      desc: "Điều phối toàn bộ chu trình xử lý dữ liệu: lên lịch ingestion, trigger dbt runs, thực hiện kiểm tra chất lượng dữ liệu (Data Quality Checks) và quản lý CI/CD deployment an toàn.",
      code: `from airflow import DAG
from airflow.operators.bash import BashOperator
from airflow.providers.snowflake.operators.snowflake import SnowflakeOperator

with DAG("modern_elt_pipeline", schedule="*/5 * * * *", catchup=False) as dag:
    run_fivetran = BashOperator(task_id="fivetran_sync", bash_command="fivetran sync")
    run_dbt = BashOperator(task_id="dbt_build", bash_command="dbt build --select marts")
    run_fivetran >> run_dbt`
    }
  },
  etl: {
    "src-bravo": {
      icon: "🏭",
      title: "BRAVO 8 SQL Server (Enterprise ERP)",
      role: "Core OLTP Database System",
      stage: "01 // SOURCE",
      desc: "Hệ quản trị CSDL lõi của phần mềm ERP BRAVO 8 vận hành tại THACO (Sản xuất ô tô) và Lộc Phúc Jewelry. Lưu trữ toàn bộ dữ liệu giao dịch phát sinh: Đơn mua vật tư, Lệnh sản xuất, Chứng từ kế toán và Kho.",
      code: `-- Truy vấn chứng từ nhập xuất kho vật tư trong ngày
SELECT VoucherNo, VoucherDate, WarehouseCode, ItemCode, Quantity, UnitPrice
FROM dbo.B20VoucherDetail 
WHERE VoucherDate = CAST(GETDATE() AS DATE);`
    },
    "src-po": {
      icon: "📑",
      title: "Purchasing & Purchase Orders (PO)",
      role: "Procurement & Vendor POs",
      stage: "01 // SOURCE",
      desc: "Phân hệ Đơn Hàng Mua tại THACO: Theo dõi luồng phê duyệt đơn đặt mua linh kiện ô tô với các nhà cung cấp quốc tế, kiểm soát giá mua, thuế nhập khẩu và tiến độ giao hàng về các nhà máy lắp ráp Chu Lai.",
      code: `-- Trích xuất PO và tiến độ giao hàng
SELECT PoNumber, VendorCode, OrderDate, DeliveryDate, TotalAmount, ApprovalStatus
FROM dbo.B20PurchasingOrder
WHERE ApprovalStatus = 'APPROVED';`
    },
    "src-inv": {
      icon: "💍",
      title: "Inventory & Warehouses (0.01g Precision)",
      role: "Inventory & Valuation System",
      stage: "01 // SOURCE",
      desc: "Phân hệ Kho linh kiện phụ tùng ô tô (THACO) và kho vàng bạc đá quý (Lộc Phúc Jewelry). Quản lý định mức tiêu hao, hao hụt kim hoàn chính xác đến 0.01 gram và phân bổ kho theo nhiều cấp vị trí (Bin/Rack).",
      code: `-- Kiểm tra thẻ kho và trọng lượng vàng thực tế đến 0.01g
SELECT ItemCode, WarehouseCode, BatchNo, 
       CAST(QuantityGram AS DECIMAL(18, 2)) AS GoldWeight,
       CostPrice
FROM dbo.B20WarehouseStock
WHERE QuantityGram > 0;`
    },
    "src-gl": {
      icon: "📒",
      title: "General Ledger & Accounts Receivable",
      role: "Financial & Accounting Records",
      stage: "01 // SOURCE",
      desc: "Sổ cái kế toán tổng hợp và quản lý công nợ nhà cung cấp/khách hàng. Cơ sở để đối soát doanh thu, giá vốn, thuế GTGT và dòng tiền hoạt động của tập đoàn.",
      code: `-- Truy vấn số dư phát sinh nợ/có tài khoản 156, 632, 511
SELECT AccountNo, DebitAmount, CreditAmount, CurrencyCode
FROM dbo.B20GeneralLedger
WHERE FiscalYear = YEAR(GETDATE());`
    },
    "src-vouchers": {
      icon: "📝",
      title: "B20 Voucher Transaction Stream",
      role: "Continuous Accounting Vouchers",
      stage: "01 // SOURCE",
      desc: "Dòng chứng từ kế toán nhập xuất kho (PNK, PXK), phiếu chi, ủy nhiệm chi phát sinh hàng ngày cần được trích xuất và biến đổi theo lô ban đêm.",
      code: `SELECT VoucherType, VoucherNo, PostingDate, Amount, Currency
FROM dbo.B20VoucherHeader
WHERE PostingDate >= DATEADD(day, -1, GETDATE());`
    },
    "ing-extractor": {
      icon: "⚙️",
      title: "Batch ETL Extractor",
      role: "Delta Extraction & Checksum Engine",
      stage: "02 // EXTRACTION",
      desc: "Module trích xuất dữ liệu định kỳ (Nightly Batch) áp dụng thuật toán so khớp Checksum (HASHBYTES SHA2_256) và trường ModifiedDate để chỉ trích xuất các bản ghi có thay đổi thực sự, hạn chế tối đa tải cho database vận hành ban ngày.",
      code: `-- Stored procedure trích xuất Delta dựa trên Hash Checksum
CREATE PROCEDURE dbo.sp_Extract_ERP_Delta
AS
BEGIN
  SELECT ItemCode, WarehouseCode, Quantity,
         HASHBYTES('SHA2_256', CONCAT(ItemCode, WarehouseCode, Quantity, UnitPrice)) AS RowHash
  FROM dbo.B20VoucherDetail
  WHERE ModifiedDate >= DATEADD(hour, -24, GETDATE());
END;`
    },
    "trans-engine": {
      icon: "⚡",
      title: "In-Transit Transformation Engine",
      role: "FIFO Valuation & Business Rule Processor",
      stage: "03 // IN-TRANSIT TRANSFORM",
      desc: "Khác với ELT (biến đổi trong data warehouse), mô hình Enterprise ETL truyền thống thực hiện biến đổi dữ liệu ngay trên máy chủ trung gian ETL: Tính giá vốn đích danh hoặc nhập trước xuất trước (FIFO Costing), tính hao hụt kim hoàn 0.01g và chuẩn hóa hóa đơn thuế GTGT trước khi ghi vào kho.",
      code: `-- Thuật toán tính giá xuất kho FIFO & Chuẩn hóa định mức vàng
DECLARE @RemainQty DECIMAL(18,2) = @ExportQty;
DECLARE fifo_cursor CURSOR FOR
SELECT InQty, UnitCost FROM #TempInStock ORDER BY InDate ASC;
-- Lặp qua từng lô nhập để tính toán giá xuất chính xác trước khi nạp Mart`
    },
    "load-marts": {
      icon: "📦",
      title: "Target Curated Data Marts",
      role: "Curated Dimensional Tables",
      stage: "04 // DATA MARTS",
      desc: "Dữ liệu sau khi được làm sạch và tính toán chuẩn xác được nạp vào các bảng Fact và Dimension đã được tối ưu hóa: FactSales, FactInventory, DimProduct, DimVendor phục vụ phân tích nghiệp vụ chuyên sâu.",
      code: `-- Nạp bảng Fact kho đã qua tính toán FIFO
INSERT INTO EDW.Fact_WarehouseMovement (VoucherNo, ItemKey, WarehouseKey, OutQty, FifoCost)
SELECT VoucherNo, ItemKey, WarehouseKey, OutQty, CalculatedFifoCost
FROM Staging.CleanedVouchers;`
    },
    "wh-ssas": {
      icon: "🛡️",
      title: "Enterprise DWH & SSAS Cubes",
      role: "Audit Reconciliation & Multidimensional OLAP",
      stage: "05 // DATA MARTS + SERVING",
      desc: "Kho dữ liệu doanh nghiệp kết hợp khối phân tích đa chiều SQL Server Analysis Services (SSAS). Tự động chạy script đối soát 100% khớp sổ kế toán (Reconciliation Script), đảm bảo số liệu báo cáo tài chính không sai lệch dù chỉ 1 đồng.",
      code: `-- Script đối soát tự động: Tổng giá trị kho vs Tổng sổ cái tài khoản 156
SELECT 
    wh.TotalStockVal, 
    gl.TotalGL156Val,
    (wh.TotalStockVal - gl.TotalGL156Val) AS Discrepancy
FROM (SELECT SUM(Quantity * FifoCost) AS TotalStockVal FROM EDW.Fact_WarehouseStock) wh
CROSS JOIN (SELECT SUM(DebitAmount - CreditAmount) AS TotalGL156Val FROM EDW.Fact_GeneralLedger WHERE AccountNo = '156') gl;
-- Discrepancy MUST BE 0.00`
    },
    "con-bod": {
      icon: "👔",
      title: "BOD & Plant Executive",
      role: "C-Level Leadership & Assembly Plants",
      stage: "06 // CONSUMERS",
      desc: "Ban Giám Đốc THACO và Lộc Phúc Jewelry theo dõi bảng điều khiển điều hành: Tiến độ sản xuất xe hơi Chu Lai, tỷ lệ hao hụt vàng từng xưởng và doanh thu chuỗi bán lẻ toàn quốc.",
      code: `-- MDX Query phục vụ Executive Dashboard
SELECT 
  {[Measures].[NetSales], [Measures].[GrossMargin]} ON COLUMNS,
  NON EMPTY [DimShowroom].[City].Members ON ROWS
FROM [JewelrySalesCube];`
    },
    "con-finance": {
      icon: "💰",
      title: "Finance, Chief Accountant & Auditing",
      role: "Tax Authorities & Audit Compliance",
      stage: "06 // CONSUMERS",
      desc: "Phòng Kế toán trưởng và đơn vị kiểm toán độc lập khai thác báo cáo thuế, báo cáo lưu chuyển tiền tệ và bảng cân đối số phát sinh với độ tin cậy tuyệt đối.",
      code: `-- Khai thác Bảng Cân Đối Phát Sinh Tài Khoản tháng
EXEC EDW.sp_GenerateTrialBalance @Month = 8, @Year = 2026;`
    },
    "orch-agent": {
      icon: "🕒",
      title: "SQL Server Agent & Scheduled Jobs",
      role: "Automated Enterprise Job Scheduler",
      stage: "BOTTOM // ORCHESTRATION",
      desc: "Lập lịch chạy tự động ban đêm (Nightly Batch Jobs lúc 01:00 AM): kích hoạt Stored Procedures trích xuất Delta, chạy thuật toán tính FIFO, đối soát số liệu và gửi email thông báo trạng thái hoàn tất cho quản trị viên trước giờ làm việc sáng.",
      code: `-- Job Step cấu hình trong SQL Server Agent
EXEC msdb.dbo.sp_add_jobstep  
    @job_name = N'Nightly_ERP_ETL_Sync',  
    @step_name = N'Execute_FIFO_And_Reconciliation',  
    @subsystem = N'TSQL',  
    @command = N'EXEC EDW.sp_RunNightlyBatchSync;',  
    @retry_attempts = 3,  
    @retry_interval = 5;`
    }
  }
};

let currentPipelineVariant = 'elt';
let currentPipelineNodeId = 'ing-fivetran';

function switchPipelineVariant(variant) {
  currentPipelineVariant = variant;
  const eltGroup = document.getElementById('groupVariantElt');
  const etlGroup = document.getElementById('groupVariantEtl');
  const btnElt = document.getElementById('btnToggleElt');
  const btnEtl = document.getElementById('btnToggleEtl');

  if (variant === 'elt') {
    if (eltGroup) { eltGroup.classList.remove('hidden'); eltGroup.classList.add('active'); }
    if (etlGroup) { etlGroup.classList.remove('active'); etlGroup.classList.add('hidden'); }
    if (btnElt) btnElt.classList.add('active');
    if (btnEtl) btnEtl.classList.remove('active');
    inspectPipelineNode('elt', 'ing-fivetran');
  } else if (variant === 'etl') {
    if (eltGroup) { eltGroup.classList.remove('active'); eltGroup.classList.add('hidden'); }
    if (etlGroup) { etlGroup.classList.remove('hidden'); etlGroup.classList.add('active'); }
    if (btnEtl) btnEtl.classList.add('active');
    if (btnElt) btnElt.classList.remove('active');
    inspectPipelineNode('etl', 'trans-engine');
  }
}

function inspectPipelineNode(variant, nodeId) {
  currentPipelineVariant = variant;
  currentPipelineNodeId = nodeId;

  // Highlight active node in SVG
  const activeGroup = variant === 'elt' ? document.getElementById('groupVariantElt') : document.getElementById('groupVariantEtl');
  if (activeGroup) {
    activeGroup.querySelectorAll('.pl-node').forEach(node => {
      const onclickAttr = node.getAttribute('onclick') || '';
      if (onclickAttr.includes(`'${nodeId}'`)) {
        node.classList.add('active');
      } else {
        node.classList.remove('active');
      }
    });
  }

  const variantData = PIPELINE_NODES[variant];
  if (!variantData) return;
  const nodeData = variantData[nodeId];
  if (!nodeData) return;

  const inspector = document.getElementById('bpInspectorPanel');
  const titleEl = document.getElementById('bpInspectorTitle');
  const stageEl = document.getElementById('bpInspectorStageTag');
  const descEl = document.getElementById('bpInspectorDesc');
  const codeEl = document.getElementById('bpInspectorCode');

  if (inspector) {
    inspector.style.opacity = '0.35';
    setTimeout(() => {
      if (titleEl) {
        titleEl.innerHTML = `
          <span>${nodeData.icon || '⚙️'}</span>
          <span>${nodeData.title}</span>
          <span style="font-size: 0.82rem; color: #94A3B8; font-weight: normal; margin-left: 6px;">— ${nodeData.role || ''}</span>
        `;
      }
      if (stageEl) {
        stageEl.textContent = nodeData.stage || 'STAGE DETAIL';
      }
      if (descEl) {
        descEl.textContent = nodeData.desc || '';
      }
      if (codeEl) {
        if (nodeData.code) {
          codeEl.style.display = 'block';
          codeEl.textContent = nodeData.code;
        } else {
          codeEl.style.display = 'none';
        }
      }
      inspector.style.opacity = '1';
    }, 120);
  }
}

// --- 4. INSPECT SPECIFIC NODE (Bottom Detail Drawer - Legacy) ---
function inspectSpecificNode(archKey, nodeId, type) {
  const arch = ARCHITECTURES[archKey];
  if (!arch) return;
  currentNodeKey = nodeId;

  // Highlight active element in DOM
  document.querySelectorAll('[data-node-id]').forEach(el => {
    el.classList.toggle('active', el.getAttribute('data-node-id') === nodeId);
  });

  // Find target node data
  let nodeData = null;
  if (type === 'source') {
    nodeData = arch.sources.find(s => s.id === nodeId);
  } else if (type === 'ingestion') {
    nodeData = arch.ingestion;
  } else if (type === 'lake') {
    nodeData = arch.lake;
  } else if (type === 'load') {
    nodeData = arch.load;
  } else if (type === 'transform') {
    nodeData = arch.transform.subnodes.find(n => n.id === nodeId);
  } else if (type === 'consumer') {
    nodeData = arch.consumers.find(c => c.id === nodeId);
  }

  if (!nodeData) return;

  const inspector = document.getElementById('bpInspectorPanel');
  if (!inspector) return;

  inspector.style.opacity = '0.4';
  setTimeout(() => {
    document.getElementById('bpInspectorTitle').innerHTML = `
      <span>${nodeData.icon || '⚙️'}</span>
      <span>${nodeData.title}</span>
      <span style="font-size: 0.8rem; color: #94A3B8; font-weight: normal;">— ${nodeData.role || ''}</span>
    `;
    document.getElementById('bpInspectorStageTag').textContent = nodeData.stage || 'STAGE DETAIL';
    document.getElementById('bpInspectorDesc').textContent = nodeData.desc || '';
    
    const codeEl = document.getElementById('bpInspectorCode');
    if (codeEl) {
      if (nodeData.code) {
        codeEl.style.display = 'block';
        codeEl.textContent = nodeData.code;
      } else {
        codeEl.style.display = 'none';
      }
    }
    inspector.style.opacity = '1';
  }, 120);
}

// --- 5. SWITCH ARCHITECTURE TAB ---
function switchArchitecture(archKey) {
  renderBlueprintCanvas(archKey);
}

// --- 6. COPY EMAIL ADDRESS TO CLIPBOARD ---
function copyEmailAddress() {
  const email = 'trandc3015@gmail.com';
  navigator.clipboard.writeText(email).then(() => {
    const toast = document.getElementById('copyToast');
    if (toast) {
      toast.classList.add('show');
      setTimeout(() => {
        toast.classList.remove('show');
      }, 2400);
    }
  }).catch(err => {
    prompt('Sao chép email:', email);
  });
}

// --- 7. PROJECTS DATA & MODAL VIEWER (Mark Pham Style) ---
const PROJECTS_DATA = {
  adventureworks: {
    id: "adventureworks",
    title: "AdventureWorks Modern Data Platform",
    category: "Data Pipeline",
    graphic: "❄️ 🦋",
    lead: "Production-grade ELT platform syncing SQL Server OLTP to Snowflake via CDC and dlt, modeled with dbt Core (Kimball Star Schema) and visualized in Metabase BI.",
    highlights: [
      "23,935 rows merged",
      "30 automated dbt tests",
      "100% CDC Deduplication",
      "SCD Type 2 Price Tracking"
    ],
    problem: "Các batch ETL truyền thống làm khóa bảng hệ thống bán lẻ (table locks) và gây trễ báo cáo sang ngày hôm sau. Yêu cầu đặt ra là phải truyền tin liên tục với độ trễ thấp và không gây lỗi nhân bản đơn hàng (Fan-out).",
    solution: "Kích hoạt SQL Server CDC ghi nhận vào transaction log. Dùng dlt (Python) nạp append-only theo Log Sequence Number (_start_lsn) vào Snowflake Bronze với RSA Key-Pair Auth. Khử trùng lặp tại dbt Staging bằng ROW_NUMBER() và theo dõi lịch sử biến động giá qua SCD Type 2.",
    tech: ["dbt Core", "Snowflake", "dlt (Python)", "SQL Server CDC", "Docker", "Metabase", "RSA Auth"],
    articleUrl: "blog/bai-viet-5.html",
    githubUrl: "https://github.com/tranduc2204/adventure_works"
  },
  erp_bravo: {
    id: "erp_bravo",
    title: "Enterprise ERP BRAVO (THACO & Lộc Phúc)",
    category: "Enterprise ERP",
    graphic: "🏭 💎",
    lead: "Triển khai phân hệ Mua hàng, Quản lý kho, Kế toán tại THACO và hệ thống kiểm soát định mức hao hụt kim hoàn 0.01g tại Lộc Phúc Jewelry.",
    highlights: [
      "Hàng nghìn chứng từ/ngày",
      "Sai số tối đa 0.01g vàng",
      "Zero Deadlock T-SQL MERGE",
      "SSAS Tabular Cubes"
    ],
    problem: "Khối lượng chứng từ khổng lồ tại THACO gây hiện tượng Deadlock nghiêm trọng khi chốt sổ cuối tháng. Tại Lộc Phúc Jewelry, vàng và đá quý đòi hỏi theo dõi chính xác đến từng miligram qua các khâu đúc, cán, đánh bóng.",
    solution: "Tối ưu hóa Stored Procedure với Transaction Isolation Level Snapshot, phân tách ODS Staging Server giảm tải 100% cho máy chủ ERP chính. Xây dựng động cơ tính giá vốn FIFO và kiểm soát đối soát tự động.",
    tech: ["SQL Server 2022", "SSIS", "T-SQL", "FIFO Costing", "BRAVO 8", "Power BI", "Audit Trail"],
    articleUrl: "blog/bai-viet-2.html",
    githubUrl: "https://github.com/tranduc2204"
  },
  bigdata_spark: {
    id: "bigdata_spark",
    title: "End-to-End Big Data Lakehouse với Spark & Airflow",
    category: "Big Data",
    graphic: "🔥 ⚡",
    lead: "Đường ống xử lý dữ liệu lớn phân tán: Apache Kafka, PySpark Structured Streaming micro-batch 1s, Delta Lake ACID và Airflow Orchestration.",
    highlights: [
      "Broadcast Join No Shuffle",
      "Micro-batch 1s Latency",
      "Delta Lake ACID Parquet",
      "Airflow DAGs Automated"
    ],
    problem: "Hàng triệu bản ghi sự kiện telemetry IoT và clickstream đổ về liên tục vượt quá khả năng xử lý của cơ sở dữ liệu quan hệ truyền thống, dễ gây mất mát dữ liệu khi server crash.",
    solution: "Tiếp nhận qua Kafka Event Bus, xử lý luồng bằng PySpark Structured Streaming, nạp vào Delta Lake Bronze/Silver/Gold hỗ trợ ACID transactions, time-travel và Z-Order clustering.",
    tech: ["Apache Spark", "PySpark", "Apache Kafka", "Delta Lake", "Airflow", "Docker", "Parquet"],
    articleUrl: "blog/index.html",
    githubUrl: "https://github.com/tranduc2204"
  },
  cand_infra: {
    id: "cand_infra",
    title: "Hạ Tầng CNTT Trực Chiến 24/7 — CAND",
    category: "Data Pipeline",
    graphic: "🛡️ 📡",
    lead: "Quản trị hạ tầng mạng viễn thông, CSDL Quốc gia về Dân cư và hệ thống truyền tin báo cháy khẩn cấp GTEL tại Đội Cảnh sát PCCC & CNCH Khu vực 15.",
    highlights: [
      "24/7 High Availability",
      "Zero Packet Drop GTEL",
      "IPsec & WireGuard Tunnels",
      "Ubuntu Server Hardening"
    ],
    problem: "Hạ tầng kỹ thuật phục vụ an ninh quốc gia và cứu nạn cứu hộ đòi hỏi tính sẵn sàng 100%, không cho phép gián đoạn đường truyền hay sai sót cấu hình bảo mật.",
    solution: "Tự tay khảo sát, đi cáp Cat6, phân tách VLAN mạng nội bộ và mạng nghiệp vụ, cấu hình Firewall pfSense, giám sát latency đường truyền GTEL và quản trị máy chủ Linux Ubuntu an toàn.",
    tech: ["Linux Ubuntu", "pfSense", "VLAN / Switching", "WireGuard VPN", "IPsec", "Network Monitoring"],
    articleUrl: "blog/bai-viet-3.html",
    githubUrl: "https://github.com/tranduc2204"
  }
};

function openProjectModal(id) {
  const p = PROJECTS_DATA[id];
  if (!p) return;

  const modal = document.getElementById('projectModal');
  if (!modal) return;

  document.getElementById('modalProjectGraphic').textContent = p.graphic;
  document.getElementById('modalProjectTag').textContent = p.category;
  document.getElementById('modalProjectTitle').textContent = p.title;
  document.getElementById('modalProjectLead').textContent = p.lead;

  // Render highlights
  const highlightsContainer = document.getElementById('modalProjectHighlights');
  if (highlightsContainer) {
    highlightsContainer.innerHTML = p.highlights.map(h => `
      <div class="modal-highlight-card">✓ ${h}</div>
    `).join('');
  }

  // Render Problem & Solution
  document.getElementById('modalProjectProblem').textContent = p.problem;
  document.getElementById('modalProjectSolution').textContent = p.solution;

  // Render Tech tags
  const techContainer = document.getElementById('modalProjectTech');
  if (techContainer) {
    techContainer.innerHTML = p.tech.map(t => `
      <span class="work-tech-pill">${t}</span>
    `).join('');
  }

  // Links
  const readLink = document.getElementById('modalProjectReadLink');
  if (readLink) {
    readLink.href = p.articleUrl;
  }
  const githubLink = document.getElementById('modalProjectGithubLink');
  if (githubLink) {
    githubLink.href = p.githubUrl;
  }

  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
  if (window.lenisInstance) window.lenisInstance.stop();
}

function closeProjectModal() {
  const modal = document.getElementById('projectModal');
  if (modal) {
    modal.classList.remove('active');
    document.body.style.overflow = '';
    if (window.lenisInstance) window.lenisInstance.start();
  }
}

function handleBackdropProjectClick(e) {
  if (e.target.id === 'projectModal') {
    closeProjectModal();
  }
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeProjectModal();
});

function filterWorks(cat) {
  document.querySelectorAll('.works-filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === cat);
  });

  document.querySelectorAll('.work-card').forEach(card => {
    if (cat === 'all' || card.dataset.category === cat) {
      card.style.display = 'flex';
    } else {
      card.style.display = 'none';
    }
  });
}

// Copy Email with Toast Feedback
function copyEmailAddress() {
  const email = "trandc3015@gmail.com";
  navigator.clipboard.writeText(email).then(() => {
    const toast = document.getElementById('copyToast');
    if (toast) {
      toast.classList.add('show');
      setTimeout(() => {
        toast.classList.remove('show');
      }, 3000);
    }
  }).catch(() => {
    prompt("Sao chép email của Dustin:", email);
  });
}

// Hero Typewriter Effect (Minh Pham Style)
function initHeroTypewriter() {
  const el = document.getElementById('heroTypewriter');
  if (!el) return;

  const phrases = [
    "Thủ khoa MIS GPA 3.7",
    "Analytics Engineer",
    "Modern Data Stack (dbt & Snowflake)",
    "CAND IT Infrastructure 24/7"
  ];

  let phraseIndex = 0;
  let charIndex = phrases[0].length;
  let isDeleting = true;
  let delay = 2400;

  function tick() {
    const current = phrases[phraseIndex];

    if (isDeleting) {
      el.textContent = current.substring(0, charIndex - 1);
      charIndex--;
      delay = 45;
    } else {
      el.textContent = current.substring(0, charIndex + 1);
      charIndex++;
      delay = 90;
    }

    if (!isDeleting && charIndex === current.length) {
      delay = 2400; // pause at finished word
      isDeleting = true;
    } else if (isDeleting && charIndex === 0) {
      isDeleting = false;
      phraseIndex = (phraseIndex + 1) % phrases.length;
      delay = 400; // brief pause before next word
    }

    setTimeout(tick, delay);
  }

  setTimeout(tick, delay);
}

// Hero Visitor Counter
function initVisitorCounter() {
  const el = document.getElementById('liveVisitorCount');
  if (!el) return;
  const count = 1284;
  el.textContent = count.toLocaleString() + '+';
}

function handleQuickConnect(e) {
  e.preventDefault();
  const input = document.getElementById('heroConnectEmail');
  if (!input || !input.value.trim()) {
    alert('Vui lòng nhập địa chỉ email của bạn.');
    return;
  }
  const email = input.value.trim();
  alert(`Cảm ơn bạn! Yêu cầu kết nối với ${email} đã được ghi nhận. Dustin sẽ gửi phản hồi sớm nhất.`);
  input.value = '';
}

// --- 8. DOM READY INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
  // Initialize Hero Elements
  initHeroTypewriter();
  initVisitorCounter();

  // Initialize 3D Argent Massif Topographic Terrain (White Theme)
  if (typeof initArgentMassifScene === 'function') {
    initArgentMassifScene();
  }

  // Initialize Mark Pham Blueprint Canvas with default architecture
  const canvasEl = document.getElementById('blueprintCanvas');
  if (canvasEl) {
    renderBlueprintCanvas('adventureworks');
  }

  // Initialize 2-Variant Pipeline DAG (ELT vs ETL) if present
  const eltGroup = document.getElementById('groupVariantElt');
  if (eltGroup) {
    switchPipelineVariant('elt');
  }

  // Initialize GSAP & Scroll Motion Engine (GPT-TASTE)
  if (typeof initScrollMotionEngine === 'function') {
    initScrollMotionEngine();
  }

  // Smooth scrolling for anchor links with header offset
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
      const targetId = this.getAttribute('href').slice(1);
      if (!targetId) return;
      const targetEl = document.getElementById(targetId);
      if (targetEl) {
        e.preventDefault();
        if (typeof closeMobileMenu === 'function') closeMobileMenu();
        if (window.lenisInstance) {
          window.lenisInstance.scrollTo(targetEl, { offset: -72, duration: 1.25 });
        } else {
          const navHeight = 72;
          const targetPos = targetEl.getBoundingClientRect().top + window.scrollY - navHeight;
          window.scrollTo({ top: targetPos, behavior: 'smooth' });
        }
      }
    });
  });

  // Mobile Menu Auto-close on resize to desktop view (> 1024px)
  window.addEventListener('resize', () => {
    if (window.innerWidth > 1024) {
      if (typeof closeMobileMenu === 'function') closeMobileMenu();
    }
  });

  // Close mobile menu if clicked outside the site-nav header
  document.addEventListener('click', (e) => {
    const nav = document.querySelector('.site-nav');
    const menu = document.getElementById('navMenuWrapper');
    if (menu && menu.classList.contains('open') && nav && !nav.contains(e.target)) {
      closeMobileMenu();
    }
  });

  // Contact form submission
  const contactForm = document.getElementById('contactForm');
  const statusBox = document.getElementById('contactStatusBox');

  if (contactForm) {
    contactForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const submitBtn = contactForm.querySelector('button[type="submit"]');
      const originalText = submitBtn.textContent;
      const message = contactForm.querySelector('[name="message"]').value.trim();

      if (!message) {
        alert('Vui lòng nhập nội dung lời nhắn.');
        return;
      }

      submitBtn.textContent = 'Đang gửi tin...';
      submitBtn.disabled = true;

      setTimeout(() => {
        submitBtn.textContent = 'Đã gửi thành công ✓';
        submitBtn.style.background = 'var(--emerald)';
        if (statusBox) {
          statusBox.style.display = 'block';
          statusBox.style.color = 'var(--emerald)';
          statusBox.textContent = 'Cảm ơn bạn! Tin nhắn đã được ghi nhận. Tôi sẽ phản hồi sớm nhất qua email.';
        }
        contactForm.reset();
        setTimeout(() => {
          submitBtn.textContent = originalText;
          submitBtn.disabled = false;
          submitBtn.style.background = '';
        }, 4000);
      }, 800);
    });
  }

  // Escape key to close any active modal or mobile menu
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (typeof closeMobileMenu === 'function') closeMobileMenu();
      if (typeof closeProjectModal === 'function') closeProjectModal();
      if (typeof closeUfmModal === 'function') closeUfmModal();
    }
  });
});

// --- 8.5. MOBILE NAVIGATION CONTROLLER ---
function toggleMobileMenu() {
  const menuWrapper = document.getElementById('navMenuWrapper');
  const toggleBtn = document.getElementById('navMobileToggle');
  if (!menuWrapper || !toggleBtn) return;
  const isOpen = menuWrapper.classList.contains('open');
  if (isOpen) {
    closeMobileMenu();
  } else {
    openMobileMenu();
  }
}

function openMobileMenu() {
  const menuWrapper = document.getElementById('navMenuWrapper');
  const toggleBtn = document.getElementById('navMobileToggle');
  if (menuWrapper) {
    menuWrapper.classList.add('open');
  }
  if (toggleBtn) {
    toggleBtn.classList.add('active');
    toggleBtn.setAttribute('aria-expanded', 'true');
  }
  document.body.style.overflow = 'hidden';
  if (window.lenisInstance) window.lenisInstance.stop();
}

function closeMobileMenu() {
  const menuWrapper = document.getElementById('navMenuWrapper');
  const toggleBtn = document.getElementById('navMobileToggle');
  if (menuWrapper) {
    menuWrapper.classList.remove('open');
  }
  if (toggleBtn) {
    toggleBtn.classList.remove('active');
    toggleBtn.setAttribute('aria-expanded', 'false');
  }
  document.body.style.overflow = '';
  if (window.lenisInstance) window.lenisInstance.start();
}

// --- 9. UFM DEGREE LOOKUP MODAL CONTROLLER ---
function openUfmModal() {
  const modal = document.getElementById('ufmModal');
  if (modal) {
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
    if (window.lenisInstance) window.lenisInstance.stop();
  }
}

function closeUfmModal() {
  const modal = document.getElementById('ufmModal');
  if (modal) {
    modal.classList.remove('active');
    document.body.style.overflow = '';
    if (window.lenisInstance) window.lenisInstance.start();
  }
}

function handleBackdropUfmClick(e) {
  if (e.target && e.target.id === 'ufmModal') {
    closeUfmModal();
  }
}

function copyUfmInfo() {
  const infoText = "Họ tên: Trần Đức | MSSV: 2021010131 | Ngày sinh: 22/04/2002 | Số hiệu bằng: UFM-7017587 | Ngành: Hệ thống thông tin quản lý | Xếp loại: Xuất sắc (Thủ khoa GPA 3.7)";
  navigator.clipboard.writeText(infoText).then(() => {
    const toast = document.getElementById('copyToast');
    if (toast) {
      toast.textContent = "✓ Đã sao chép thông tin tra cứu văn bằng UFM (MSSV: 2021010131)";
      toast.classList.add('show');
      setTimeout(() => { toast.classList.remove('show'); }, 3000);
    }
  }).catch(() => {
    alert("Thông tin tra cứu: MSSV 2021010131 - Họ tên Trần Đức - Ngày sinh 22");
  });
}

function handleUfmPortalClick(e) {
  // Pre-copy MSSV to clipboard for easy paste on the portal
  navigator.clipboard.writeText("2021010131").then(() => {
    const toast = document.getElementById('copyToast');
    if (toast) {
      toast.textContent = "✓ Đã sao chép sẵn MSSV: 2021010131! Đang mở Cổng Tra Cứu UFM...";
      toast.classList.add('show');
      setTimeout(() => { toast.classList.remove('show'); }, 3500);
    }
  }).catch(() => {});
}

// --- 10. BILINGUAL INTERNATIONALIZATION (EN / VI — DEFAULT: EN) ---
const TRANSLATIONS = {
  en: {
    // Navigation
    nav_brand_title: "trần đức",
    nav_brand_subtitle: " • analytics engineer",
    nav_about: "About",
    nav_pipeline: "Pipeline",
    nav_skills: "Skills",
    nav_experience: "Experience",
    nav_works: "Projects",
    nav_milestones: "Milestones",
    nav_certs: "Credentials",
    nav_essays: "Writing",
    nav_blog: "Blog ✍️",
    nav_cv: "CV (PDF) ↓",

    // Hero Section
    hero_visitors: "1,280+ visitors",
    hero_title: 'From <span class="accent-pipeline">Data Pipeline</span> to <span class="accent-insight">Business Insight</span>.',
    hero_sub: 'I don’t just build infrastructure — I seek answers to <span class="accent-practical">real-world business problems</span>.',
    hero_bio: 'I am <strong>Trần Đức (Dustin)</strong> — <strong>Valedictorian at UFM</strong> (GPA 3.7/4.0), experienced in <strong>building production pipelines</strong>, <strong>implementing ERP systems</strong> for enterprises, and currently <strong>managing IT infrastructure</strong> in the <strong>People’s Police (CAND)</strong> environment. The deeper I work with data, the more captivated I become by <span class="accent-story">the stories behind it</span>. That is why I chose to become an <strong class="accent-role">Analytics Engineer | Data Engineer</strong>.',
    hero_cta_resume: "Download Resume",
    hero_cta_chat: "Book a coffee chat",
    status_available: "Available",

    // Credentials Strip
    cred_ufm_org: "univ of Finance marketing",
    cred_ufm_val: "Valedictorian GPA 3.7/4.0",
    cred_cand_org: "PEOPLE'S POLICE (CAND)",
    cred_cand_val: "IT SUPPORT and Operations",
    cred_bravo_org: "BRAVO HCM",
    cred_bravo_val: "ERP Implementation Specialist",
    cred_estuary_org: "Estuary Solution",
    cred_estuary_val: "Junior Data Engineer",

    // Executive Overview (Khoa Le Style 2-Column Section)
    exec_tag_label: "EXECUTIVE STATEMENT // BUSINESS OVERVIEW",
    exec_overview_title: "Bridging the Gap from Raw Transactions to Executive Decisions",
    exec_col1_tag: "01 // OPERATIONAL CONTEXT & SCOPE",
    exec_col1_text: "I build automated reporting and analytics systems serving mission-critical units: Executive Leadership (BOD), Procurement, Warehouse Operations, and Commercial Sales. Replacing cumbersome manual spreadsheets, the platform automatically updates business performance, delivery schedules, safety stock alerts, and revenue metrics the moment transactions occur.",
    exec_col2_tag: "02 // BUSINESS VALUE & STRATEGIC BRIDGE",
    exec_col2_text: "Grounded in enterprise ERP implementation across dozens of large-scale business workflows, I deeply understand end-user pain points when reported numbers diverge from operational reality. Rather than passively waiting for tech tickets, I actively collaborate with department heads to dissect core questions: What decision does this metric drive, and how does it impact cash flow? From there, I transform raw data into audit-ready KPI engines that drive productivity and protect gross margins.",
    exec_metric1_lbl: "FASTER DECISION VELOCITY",
    exec_metric2_lbl: "AUTOMATED REPORTING OPERATIONS",
    exec_metric3_lbl: "INVENTORY AUDIT PRECISION",
    exec_metric4_lbl: "VALEDICTORIAN GPA (MIS DEGREE)",

    // How My Data Flows
    dataflow_badge: "ARCHITECTURE DIAGRAM // MODERN DATA PIPELINE",
    dataflow_title: "How My Data Flows.",
    dataflow_desc: "Production end-to-end data architecture from source systems, transformation engines, centralized warehouse to end-user analytics. Toggle between Modern ELT or Enterprise ETL below and click any node for technical deep dives and production code.",
    toggle_elt: "Modern ELT Stack (dbt + Snowflake / DuckDB)",
    toggle_etl: "Big Data ETL Pipeline (Apache Spark + Data Lake)",
    // Work Experience Section
    exp_tag_label: "CAREER // WORK EXPERIENCE",
    exp_section_title: "Work Experience.",
    exp_section_desc: "Hands-on trajectory from engineering my first data pipelines and enterprise ERP consulting to 24/7 mission-critical IT infrastructure operations.",

    // Exp 1: CAND
    exp1_date: "05/2025 — PRESENT",
    exp1_company: "People's Police (CAND)",
    exp1_loc: "HO CHI MINH CITY, VIETNAM",
    exp1_role: "IT Support & Operations",
    exp1_focus: "Infrastructure & National Database",
    exp1_desc: "Directly operating, maintaining, and providing 24/7 mission-critical IT support in a high-discipline environment: managing internal LAN infrastructure, National Population Database operations, automated fire alarm transmission systems, and digital document workflows across administrative units.",
    exp1_b1: "Configured and managed internal LAN/VLAN networks, enforcing network security policies and secure routing across operational departments.",
    exp1_b2: "Administered and operated the National Population Database system — ensuring high availability, data integrity, and strict security compliance.",
    exp1_b3: "Monitored and maintained 24/7 automated fire alarm transmission systems, ensuring zero-downtime communications for command and emergency dispatch.",
    exp1_b4: "Deployed and provided end-user technical support for digital document workflows, eliminating paperwork and accelerating administrative turnaround.",

    // Exp 2: BRAVO ERP
    exp2_date: "01/2024 — 02/2025",
    exp2_company: "BRAVO Software JSC (BRAVO ERP)",
    exp2_loc: "HO CHI MINH CITY, VIETNAM",
    exp2_role: "ERP Implementation Specialist",
    exp2_focus: "Purchasing, Warehouse & Asset Management",
    exp2_desc: "Consulted, configured, and deployed enterprise BRAVO ERP systems across complex production and retail workflows for tier-1 enterprises (THACO, Loc Phuc Fine Jewelry). Bridged real-world business requirements with underlying relational data models in SQL Server.",
    exp2_b1: "<strong>THACO Project (Truong Hai Auto):</strong> Deployed Purchasing Management module — standardized PR → PO → Receiving flows; engineered stored procedures for procurement tracking and vendor debt reconciliation.",
    exp2_b2: "<strong>Loc Phuc Fine Jewelry:</strong> Implemented Purchasing, Inventory & Asset Management modules — designed strict material yield tracking achieving 0.01g precision for precious jewelry manufacturing.",
    exp2_b3: "Engineered and optimized dozens of complex Stored Procedures, Views, and SQL queries for executive BI reports, reducing month-end data processing time by 70%+.",
    exp2_b4: "Led Data Migration and Validation from legacy databases to ERP; trained key business users and resolved real-time operational tickets during high-stakes go-live phases.",

    // Exp 3: Estuary Solution
    exp3_date: "06/2023 — 08/2023",
    exp3_company: "Estuary Solution",
    exp3_loc: "HO CHI MINH CITY, VIETNAM",
    exp3_role: "Junior Data Engineer",
    exp3_focus: "First Data Pipelines & Reporting Foundation",
    exp3_desc: "The foundational launchpad for my data engineering journey: where I first built production data pipelines, implemented end-to-end ETL jobs extracting raw records, and developed operational analytics reports.",
    exp3_b1: "Built foundational ETL pipelines: ingested raw transactional records from disparate sources, applied data cleaning and standardization before loading into analytical schemas.",
    exp3_b2: "Developed initial business intelligence reports and operational dashboards, visualizing key operational KPIs for data-driven business reviews.",
    exp3_b3: "Applied Python scripting and SQL to automate recurring data jobs, replacing repetitive manual spreadsheet manipulation with automated runs.",
    exp3_b4: "Cultivated core data quality mindset: understanding data lineage principles, data verification, and reconciliation from source transactions to final business metrics.",

    // Core Skills (Preserved for compatibility)
    skills_cat: "CORE COMPETENCIES",
    skills_title: "Technical Architecture & Tool Stack",
    skills_desc: "Modern Data Stack and Enterprise Infrastructure skills developed through production deployments and 24/7 mission-critical operations.",

    // Works
    works_title: "My Works.",
    works_filter_all: "All Works",
    works_filter_elt: "Modern ELT",
    works_filter_erp: "Enterprise ERP",
    works_filter_bi: "Analytics Engineering",

    // Milestones
    milestones_cat: "CAREER CHRONOLOGY // MILESTONES",
    milestones_title: "Key Milestones & Growth Trajectory.",
    milestones_desc: "Defining milestones that shaped my journey: from UFM Valedictorian and enterprise ERP implementations to 24/7 public safety infrastructure and modern analytics engineering.",

    ms1_date: "10/2020 — 04/2024",
    ms1_title: "University of Finance - Marketing (UFM)",
    ms1_org: "Class Valedictorian — GPA 3.7 / 4.0",

    ms2_date: "06/2023 — 08/2023",
    ms2_title: "Junior Data Engineer",
    ms2_org: "Estuary Solution",

    ms3_date: "01/2024",
    ms3_title: "SQL (Advanced) Certificate — HackerRank",
    ms3_org: "HackerRank Skill Certification",

    ms4_date: "01/2024 — 02/2025",
    ms4_title: "ERP Implementation Specialist",
    ms4_org: "BRAVO Software JSC (BRAVO ERP)",

    ms5_date: "05/2025 — PRESENT",
    ms5_title: "Public Security Duty — Infrastructure & IT Support & Operations",
    ms5_org: "Fire Prevention, Fighting & Rescue Police Team Area 15",

    ms6_date: "03/2026",
    ms6_title: "Data Engineer Associate Certificate — DataCamp",
    ms6_org: "DataCamp Professional Certification",

    // Certs
    certs_cat: "CREDENTIALS & AUDIT",
    certs_title: "Verified Certifications & Degree",
    certs_desc: "Direct verification links for professional certifications and official academic records.",
    cert_verify_btn: "Verify Certificate ↗",
    cert_lookup_btn: "Lookup Degree ↗",

    // Writing
    essays_cat: "WRITING & THOUGHTS",
    essays_title: "Technical Notes & Retrospectives",
    essays_desc: "Reflections from university to ERP field work, IT infrastructure discipline, and modern analytics engineering.",

    // Contact
    contact_title: "Let's Build Reliable Data Systems Together.",
    contact_desc: "Open for Analytics Engineer & Data Engineer opportunities. Feel free to reach out for collaboration or technical exchanges.",
    contact_name_label: "Your Name",
    contact_email_label: "Your Email",
    contact_msg_label: "Your Message",
    contact_submit: "Send Message ➔"
  },
  vi: {
    // Navigation
    nav_brand_title: "trần đức",
    nav_brand_subtitle: " • analytics engineer",
    nav_about: "Về tôi",
    nav_pipeline: "Luồng dữ liệu",
    nav_skills: "Kỹ năng",
    nav_experience: "Kinh nghiệm",
    nav_works: "Dự án",
    nav_milestones: "Cột mốc",
    nav_certs: "Chứng chỉ",
    nav_essays: "Bài viết",
    nav_blog: "Blog ✍️",
    nav_cv: "CV (PDF) ↓",

    // Hero Section
    hero_visitors: "1,280+ lượt xem",
    hero_title: 'Từ <span class="accent-pipeline">Data Pipeline</span> đến <span class="accent-insight">Business Insight</span>.',
    hero_sub: 'Tôi không chỉ xây dựng hạ tầng — tôi đi tìm câu trả lời cho <span class="accent-practical">những bài toán thực tế</span>.',
    hero_bio: 'Tôi là <strong>Trần Đức (Dustin)</strong> — <strong>Thủ khoa UFM</strong> (GPA 3.7/4.0), từng <strong>xây pipeline thực tế</strong>, <strong>triển khai ERP</strong> cho doanh nghiệp, và đang <strong>quản lý hạ tầng IT</strong> trong môi trường <strong>CAND</strong>. Càng tiếp xúc nhiều data, tôi càng bị thu hút bởi <span class="accent-story">những câu chuyện phía sau nó</span>. Và đó là lý do tôi chọn trở thành <strong class="accent-role">Analytics Engineer | Data Engineer</strong>.',
    hero_cta_resume: "Tải CV (PDF)",
    hero_cta_chat: "Hẹn cafe trò chuyện",
    status_available: "Sẵn sàng",

    // Credentials Strip
    cred_cand_org: "CÔNG AN NHÂN DÂN (CAND)",
    cred_cand_val: "IT Support & Operations",
    cred_bravo_org: "BRAVO HCM",
    cred_bravo_val: "ERP Implementation Specialist",
    cred_estuary_org: "Estuary Solution",
    cred_estuary_val: "Junior Data Engineer",
    cred_ufm_org: "ĐH TÀI CHÍNH - MARKETING",
    cred_ufm_val: "Thủ Khoa GPA 3.7/4.0",

    // Executive Overview (Khoa Le Style 2-Column Section)
    exec_tag_label: "GIỚI THIỆU // TỔNG QUAN NĂNG LỰC",
    exec_overview_title: "Rút ngắn khoảng cách từ giao dịch thực tế đến quyết định của Ban Điều Hành",
    exec_col1_tag: "01 // PHẠM VI NGHIỆP VỤ & BỐI CẢNH VẬN HÀNH",
    exec_col1_text: "Tôi xây dựng hệ thống báo cáo và phân tích tự động hóa phục vụ các khối trọng yếu: Ban Giám Đốc (BOD), Khối Mua Hàng, Vận Hành Kho và Đội ngũ Bán Hàng. Thay thế toàn bộ các quy trình tổng hợp số liệu thủ công cồng kềnh, hệ thống tự động cập nhật trạng thái kinh doanh, tiến độ giao hàng, cảnh báo tồn kho an toàn và hiệu suất doanh thu ngay khi giao dịch vừa phát sinh.",
    exec_col2_tag: "02 // GIÁ TRỊ KINH DOANH & CẦU NỐI NGHIỆP VỤ",
    exec_col2_text: "Xuất phát điểm từ tư vấn triển khai ERP thực tế trên hàng chục quy trình của doanh nghiệp lớn, tôi hiểu tường tận \"nỗi đau\" của người dùng cuối khi số liệu không khớp thực tế. Thay vì chỉ đợi nhận yêu cầu kỹ thuật thụ động, tôi chủ động cùng các Trưởng bộ phận mổ xẻ vấn đề: số liệu này giải quyết điều gì, tác động đến dòng tiền ra sao? Từ đó, biến dữ liệu thô thành công cụ đo lường KPI chính xác, thúc đẩy năng suất và bảo vệ biên lợi nhuận doanh nghiệp.",
    exec_metric1_lbl: "TĂNG TỐC ĐỘ RA QUYẾT ĐỊNH",
    exec_metric2_lbl: "TỰ ĐỘNG HÓA VẬN HÀNH BÁO CÁO",
    exec_metric3_lbl: "ĐỘ CHÍNH XÁC ĐỊNH MỨC KHO",
    exec_metric4_lbl: "THỦ KHOA HỆ THỐNG THÔNG TIN",

    // How My Data Flows
    dataflow_badge: "SƠ ĐỒ KIẾN TRÚC // LUỒNG DỮ LIỆU HIỆN ĐẠI",
    dataflow_title: "Dòng Chảy Dữ Liệu Thực Tế.",
    dataflow_desc: "Kiến trúc dòng chảy dữ liệu thực tế từ hệ thống nguồn, trạm xử lý, kho trung tâm đến người dùng cuối. Chọn mô hình Modern ELT hoặc Enterprise ETL bên dưới và bấm vào bất kỳ trạm dữ liệu nào để xem chi tiết kỹ thuật và mã nguồn thực tế.",
    toggle_elt: "Modern ELT Stack (dbt + Snowflake / DuckDB)",
    toggle_etl: "Big Data ETL Pipeline (Apache Spark + Data Lake)",
    // Work Experience Section
    exp_tag_label: "SỰ NGHIỆP // WORK EXPERIENCE",
    exp_section_title: "Kinh nghiệm làm việc.",
    exp_section_desc: "Hành trình thực chiến từ xây dựng pipeline dữ liệu đầu tiên, tư vấn triển khai ERP cho các tập đoàn lớn đến trực chiến quản trị hạ tầng CNTT trong môi trường kỷ luật.",

    // Exp 1: CAND
    exp1_date: "05/2025 — HIỆN TẠI",
    exp1_company: "Công An Nhân Dân (CAND)",
    exp1_loc: "TP. HỒ CHÍ MINH, VIỆT NAM",
    exp1_role: "IT Support & Operations",
    exp1_focus: "Quản trị Hạ tầng & Hệ thống Dân cư",
    exp1_desc: "Trực tiếp vận hành, bảo trì và trực chiến 24/7 toàn bộ hạ tầng CNTT trọng yếu trong môi trường kỷ luật nghiêm ngặt: từ quản trị mạng LAN nội bộ, hệ thống cơ sở dữ liệu dân cư quốc gia, truyền tin báo cháy tự động đến phần mềm văn thư điện tử phục vụ các phòng ban nghiệp vụ.",
    exp1_b1: "Cấu hình và quản trị hệ thống mạng LAN/VLAN nội bộ, thiết lập chính sách bảo mật mạng và định tuyến an toàn giữa các đơn vị nghiệp vụ.",
    exp1_b2: "Trực tiếp quản lý và vận hành hệ thống Cơ sở Dữ liệu Dân cư Quốc gia — bảo đảm tính sẵn sàng, toàn vẹn và bảo mật dữ liệu tuyệt đối theo tiêu chuẩn ngành.",
    exp1_b3: "Giám sát và vận hành hệ thống truyền tin báo cháy tự động 24/7, duy trì kênh kết nối thông suốt phục vụ công tác chỉ huy và ứng phó khẩn cấp.",
    exp1_b4: "Triển khai, hướng dẫn và hỗ trợ kỹ thuật người dùng cuối với phần mềm văn thư điện tử, số hóa quy trình luân chuyển công văn và hồ sơ công việc.",

    // Exp 2: BRAVO ERP
    exp2_date: "01/2024 — 02/2025",
    exp2_company: "Cổ phần Phần mềm BRAVO",
    exp2_loc: "TP. HỒ CHÍ MINH, VIỆT NAM",
    exp2_role: "ERP Implementation Specialist",
    exp2_focus: "Mua Hàng, Kho Vận & Quản Lý Tài Sản",
    exp2_desc: "Tư vấn, cấu hình và trực tiếp triển khai giải pháp BRAVO ERP trên quy mô hàng chục quy trình phức tạp cho các tập đoàn sản xuất và bán lẻ hàng đầu Việt Nam (THACO, Lộc Phúc Jewelry). Đóng vai trò cầu nối trực tiếp giữa bài toán kinh doanh thực tế và mô hình dữ liệu trong SQL Server.",
    exp2_b1: "<strong>Dự án THACO (Trường Hải Auto):</strong> Triển khai module Quản lý Mua hàng — chuẩn hóa quy trình PR &rarr; PO &rarr; Nhận hàng; viết stored procedure tổng hợp tiến độ mua sắm và đối soát công nợ nhà cung cấp.",
    exp2_b2: "<strong>Dự án Kim hoàn Lộc Phúc:</strong> Triển khai trọn gói Purchasing, Kho vận và Quản lý Tài sản thiết bị — thiết kế logic theo dõi định mức hao hụt vàng bạc đá quý đạt độ chính xác kiểm kê 0.01g.",
    exp2_b3: "Thiết kế và tối ưu hàng chục Stored Procedures, Views và SQL queries phức tạp cho hệ thống báo cáo quản trị điều hành, giảm thời gian xử lý dữ liệu cuối tháng hơn 70%.",
    exp2_b4: "Chủ trì công tác Data Migration và Data Validation từ hệ thống cũ sang ERP mới; trực tiếp đào tạo người dùng cuối và đồng hành xử lý phát sinh trong giai đoạn go-live.",

    // Exp 3: Estuary Solution
    exp3_date: "06/2023 — 08/2023",
    exp3_company: "Estuary Solution",
    exp3_loc: "TP. HỒ CHÍ MINH, VIỆT NAM",
    exp3_role: "Junior Data Engineer",
    exp3_focus: "Xây Dựng Pipeline Dữ Liệu & Báo Cáo Đầu Tiên",
    exp3_desc: "Cột mốc khởi đầu cho sự nghiệp Data Engineering: nơi tôi lần đầu tiên trực tiếp thiết kế luồng pipeline thực tế, xây dựng các tác vụ ETL đầu tiên để thu thập dữ liệu thô và phát triển các bộ báo cáo phân tích phục vụ kinh doanh.",
    exp3_b1: "Xây dựng những pipeline ETL đầu tiên: thu thập dữ liệu thô từ nhiều nguồn phân tán, xử lý chuẩn hóa và làm sạch trước khi nạp vào cơ sở dữ liệu phân tích.",
    exp3_b2: "Phát triển các báo cáo nghiệp vụ và dashboard phân tích đầu tiên, trực quan hóa các chỉ số đo lường hiệu suất vận hành giúp doanh nghiệp theo dõi số liệu trực quan.",
    exp3_b3: "Ứng dụng Python scripting và SQL để tự động hóa quy trình xử lý dữ liệu định kỳ, thay thế các thao tác xuất file và tổng hợp bảng tính thủ công.",
    exp3_b4: "Hình thành tư duy cốt lõi về chất lượng dữ liệu (Data Quality): hiểu rõ nguyên tắc truy vết nguồn gốc (lineage) và tính nhất quán của số liệu từ hệ thống nguồn đến báo cáo cuối cùng.",

    // Core Skills (Preserved for compatibility)
    skills_cat: "NĂNG LỰC KỸ THUẬT CỐT LÕI",
    skills_title: "Kiến Trúc Kỹ Thuật & Bộ Công Cụ",
    skills_desc: "Kỹ năng Modern Data Stack và Hạ tầng Doanh nghiệp được tôi luyện qua các dự án triển khai thực tế và vận hành trực chiến 24/7.",

    // Works
    works_title: "Dự Án Thực Chiến.",
    works_filter_all: "Tất cả",
    works_filter_elt: "Modern ELT",
    works_filter_erp: "Enterprise ERP",
    works_filter_bi: "Analytics Engineering",

    // Milestones
    milestones_cat: "CAREER CHRONOLOGY // HÀNH TRÌNH PHÁT TRIỂN",
    milestones_title: "Cột mốc sự nghiệp & Bước đệm trưởng thành.",
    milestones_desc: "Những dấu mốc thực chiến định hình bản lĩnh: từ bệ phóng Thủ khoa UFM, lăn lộn triển khai ERP tại doanh nghiệp lớn, kỷ luật trực chiến 24/7 trong ngành Công an đến mục tiêu Analytics Engineer toàn năng.",

    ms1_date: "10/2020 — 04/2024",
    ms1_title: "Đại học Tài chính - Marketing (UFM)",
    ms1_org: "Thủ khoa đầu ra — GPA 3.7/4.0",

    ms2_date: "06/2023 — 08/2023",
    ms2_title: "Junior Data Engineer",
    ms2_org: "Estuary Solution",

    ms3_date: "01/2024",
    ms3_title: "Chứng chỉ SQL (Advanced) — HackerRank",
    ms3_org: "HackerRank Skill Certification",

    ms4_date: "01/2024 — 02/2025",
    ms4_title: "ERP Implementation Specialist",
    ms4_org: "Cổ phần Phần mềm BRAVO (BRAVO ERP)",

    ms5_date: "05/2025 — HIỆN TẠI",
    ms5_title: "Nghĩa vụ CAND — Quản Trị Hạ Tầng & IT Support & Operations",
    ms5_org: "Đội Cảnh sát PCCC & CNCH Khu vực 15",

    ms6_date: "03/2026",
    ms6_title: "Chứng chỉ Data Engineer Associate — DataCamp",
    ms6_org: "DataCamp Professional Certification",

    // Certs
    certs_cat: "CHỨNG CHỈ & XÁC THỰC",
    certs_title: "Chứng Chỉ Chuyên Môn & Văn Bằng",
    certs_desc: "Liên kết xác thực trực tiếp các chứng chỉ nghề nghiệp quốc tế và cơ sở dữ liệu tra cứu văn bằng tốt nghiệp chính thức.",
    cert_verify_btn: "Xác thực chứng chỉ ↗",
    cert_lookup_btn: "Tra cứu văn bằng ↗",

    // Writing
    essays_cat: "GÓC NHÌN & TỰ SỰ",
    essays_title: "Bài Viết & Góc Nhìn Kỹ Thuật",
    essays_desc: "Những đúc kết từ giảng đường đại học, thực chiến ERP, kỷ luật trực chiến hạ tầng và hành trình định vị Analytics Engineer.",

    // Contact
    contact_title: "Cùng Xây Dựng Hệ Thống Dữ Liệu Đáng Tin Cậy.",
    contact_desc: "Sẵn sàng đón nhận các cơ hội thử thách trong vai trò Analytics Engineer & Data Engineer. Kết nối trực tiếp để thảo luận kỹ thuật hoặc hợp tác.",
    contact_name_label: "Họ tên của bạn",
    contact_email_label: "Địa chỉ Email",
    contact_msg_label: "Nội dung thông điệp",
    contact_submit: "Gửi thông điệp ngay ➔"
  }
};

let currentLang = localStorage.getItem('dustin_lang') || 'en';

function setLanguage(lang) {
  currentLang = lang;
  localStorage.setItem('dustin_lang', lang);
  document.documentElement.setAttribute('lang', lang);

  // Update Toggle Button active state
  document.querySelectorAll('.nav-lang-toggle').forEach(btn => {
    const en = btn.querySelector('.lang-code.en');
    const vi = btn.querySelector('.lang-code.vi');
    if (en && vi) {
      if (lang === 'en') {
        en.classList.add('active');
        vi.classList.remove('active');
      } else {
        vi.classList.add('active');
        en.classList.remove('active');
      }
    }
  });

  const dict = TRANSLATIONS[lang] || TRANSLATIONS.en;

  // Text contents
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (dict[key] !== undefined) {
      el.textContent = dict[key];
    }
  });

  // HTML contents (preserving styling spans)
  document.querySelectorAll('[data-i18n-html]').forEach(el => {
    const key = el.getAttribute('data-i18n-html');
    if (dict[key] !== undefined) {
      el.innerHTML = dict[key];
    }
  });

  // Input placeholders
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    if (dict[key] !== undefined) {
      el.setAttribute('placeholder', dict[key]);
    }
  });

  // Refresh ScrollTrigger after DOM text updates
  if (typeof window.ScrollTrigger !== 'undefined') {
    setTimeout(() => {
      try { window.ScrollTrigger.refresh(); } catch (e) {}
    }, 150);
  }
}

function toggleLanguage() {
  const nextLang = (currentLang === 'en') ? 'vi' : 'en';
  setLanguage(nextLang);
}

// Auto-init language on load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => setLanguage(currentLang));
} else {
  setLanguage(currentLang);
}

// ==========================================================================
// --- 11. ADVANCED GSAP SCROLL MOTION & INTERSECTION CONTROLLER (GPT-TASTE) ---
// ==========================================================================
function initScrollMotionEngine() {
  const progressBar = document.getElementById('scrollProgressBar');
  const siteNav = document.querySelector('.site-nav');
  const hasGsap = typeof window.gsap !== 'undefined' && typeof window.ScrollTrigger !== 'undefined';

  // 0. Initialize Lenis Virtual Momentum Smooth Scroll Engine (High-Refresh 120FPS Direct Response)
  if (typeof window.Lenis !== 'undefined') {
    try {
      window.lenisInstance = new window.Lenis({
        duration: 0.55, // Snappy, instant 120Hz tracking with zero input latency
        easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        orientation: 'vertical',
        gestureOrientation: 'vertical',
        smoothWheel: true,
        wheelMultiplier: 1.15,
        touchMultiplier: 1.0,
        syncTouch: false, // Don't intercept native 120Hz touch/trackpad gestures
        infinite: false
      });

      // Synchronize Lenis with GSAP ScrollTrigger
      if (hasGsap) {
        window.lenisInstance.on('scroll', ScrollTrigger.update);
        gsap.ticker.add((time) => {
          window.lenisInstance.raf(time * 1000);
        });
        gsap.ticker.lagSmoothing(500, 33);
      } else {
        function lenisStep(time) {
          window.lenisInstance.raf(time);
          requestAnimationFrame(lenisStep);
        }
        requestAnimationFrame(lenisStep);
      }
    } catch (e) {
      console.warn('Lenis smooth scroll failed to initialize:', e);
    }
  }

  // A. Top Reading Progress Bar & Scrolled Nav State (Zero layout thrashing)
  const updateScrollProgress = (currentScroll, maxScroll) => {
    let scrollTop = currentScroll;
    let scrollHeight = maxScroll;
    if (typeof scrollTop !== 'number') {
      scrollTop = window.scrollY || document.documentElement.scrollTop;
      scrollHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight;
    }
    if (progressBar && scrollHeight > 0) {
      const percent = Math.min(Math.max((scrollTop / scrollHeight) * 100, 0), 100);
      progressBar.style.width = `${percent}%`;
    }
    if (siteNav) {
      siteNav.classList.toggle('scrolled', scrollTop > 35);
    }
  };

  if (window.lenisInstance) {
    window.lenisInstance.on('scroll', ({ scroll, limit }) => {
      updateScrollProgress(scroll, limit);
    });
  } else {
    window.addEventListener('scroll', () => updateScrollProgress(), { passive: true });
  }
  updateScrollProgress();

  // B. Register GSAP & ScrollTrigger Animations
  if (hasGsap) {
    try {
      gsap.registerPlugin(ScrollTrigger);

      // 1. Hero Cinematic Stagger (Paced, Gradual & Luxurious)
      const heroTl = gsap.timeline({ delay: 0.2, defaults: { ease: 'power2.out' } });

      if (document.querySelector('.hero-visitor-pill')) {
        heroTl.from('.hero-visitor-pill', { y: -16, opacity: 0, duration: 1.1 });
      }
      if (document.querySelector('.hero-manifesto-title')) {
        heroTl.from('.hero-manifesto-title', { y: 35, opacity: 0, duration: 1.45, ease: 'power3.out' }, '-=0.7');
      }
      if (document.querySelector('.hero-manifesto-sub')) {
        heroTl.from('.hero-manifesto-sub', { y: 24, opacity: 0, duration: 1.35 }, '-=0.9');
      }
      if (document.querySelector('.hero-manifesto-bio')) {
        heroTl.from('.hero-manifesto-bio', { y: 20, opacity: 0, duration: 1.3 }, '-=0.9');
      }
      if (document.querySelector('.hero-social-strip')) {
        heroTl.from('.hero-social-strip .hero-social-btn', {
          scale: 0.85,
          opacity: 0,
          duration: 0.85,
          stagger: 0.08
        }, '-=0.7');
      }
      if (document.querySelector('.hero-cta-group')) {
        heroTl.from('.hero-cta-group .hero-pill-btn', {
          y: 22,
          opacity: 0,
          duration: 1.15,
          stagger: 0.16
        }, '-=0.6');
      }
      if (document.querySelector('.hero-basic-showcase')) {
        heroTl.from('.hero-basic-showcase', {
          scale: 0.94,
          y: 35,
          opacity: 0,
          duration: 1.6,
          ease: 'power2.out'
        }, '-=1.1');
      }

      // 1B. Parallax Micro-Motion (Instant 1:1 Hardware Scrub for 120fps)
      if (document.querySelector('.hero-basic-frame')) {
        gsap.to('.hero-basic-frame', {
          scrollTrigger: {
            trigger: '#about',
            start: 'top top',
            end: 'bottom top',
            scrub: true
          },
          y: 40,
          ease: 'none'
        });
      }

      // 1C. Section Headers Stagger & Letter-Spacing Reveal
      document.querySelectorAll('.editorial-section, .exec-section').forEach(sec => {
        const lbl = sec.querySelector('.section-label');
        const h2 = sec.querySelector('.section-heading');
        const sub = sec.querySelector('.section-subtext');
        if (h2) {
          const sTl = gsap.timeline({
            scrollTrigger: {
              trigger: sec,
              start: 'top 85%'
            },
            defaults: { ease: 'power3.out' }
          });
          if (lbl) sTl.from(lbl, { x: -20, opacity: 0, duration: 0.95 });
          sTl.from(h2, { y: 30, opacity: 0, duration: 1.15 }, '-=0.75');
          if (sub) sTl.from(sub, { y: 20, opacity: 0, duration: 1.0 }, '-=0.85');
        }
      });

      // 2. Credentials Strip Stagger (Slow & Calm)
      if (document.querySelector('.credentials-strip')) {
        gsap.from('.credentials-strip .cred-item', {
          scrollTrigger: {
            trigger: '.credentials-strip',
            start: 'top 90%'
          },
          y: 24,
          opacity: 0,
          duration: 1.15,
          stagger: 0.16,
          ease: 'power2.out'
        });
      }

      // 3. Executive Overview Reveal (#pipeline)
      if (document.querySelector('.exec-overview-header')) {
        gsap.from('.exec-overview-header, .exec-overview-title', {
          scrollTrigger: {
            trigger: '#pipeline',
            start: 'top 82%'
          },
          y: 30,
          opacity: 0,
          duration: 1.25,
          stagger: 0.18,
          ease: 'power2.out'
        });

        gsap.from('.exec-col', {
          scrollTrigger: {
            trigger: '.exec-overview-cols',
            start: 'top 84%'
          },
          y: 40,
          opacity: 0,
          duration: 1.4,
          stagger: 0.25,
          ease: 'power2.out'
        });
      }

      // 4. Architecture Pipeline Canvas & DAG (Instant 1:1 Hardware Scrub)
      if (document.querySelector('.variant-dag-container')) {
        gsap.from('.dataflow-header, .variant-dag-container, .data-inspector-panel', {
          scrollTrigger: {
            trigger: '.variant-dag-container',
            start: 'top 82%'
          },
          y: 38,
          opacity: 0,
          duration: 1.35,
          stagger: 0.22,
          ease: 'power2.out'
        });

        gsap.to('.variant-dag-container', {
          scrollTrigger: {
            trigger: '#pipeline',
            start: 'top 70%',
            end: 'bottom top',
            scrub: true
          },
          y: -14,
          ease: 'none'
        });
      }

      // 5. Work Experience Timeline Cards (#experience)
      const expCards = document.querySelectorAll('.exp-item-card');
      if (expCards.length > 0) {
        expCards.forEach((card, idx) => {
          gsap.from(card, {
            scrollTrigger: {
              trigger: card,
              start: 'top 85%'
            },
            y: 45,
            opacity: 0,
            duration: 1.4,
            delay: idx * 0.1,
            ease: 'power2.out'
          });

          // Staggered reveal for sub-bullets inside each experience card
          const bullets = card.querySelectorAll('.exp-item-bullets-grid li');
          if (bullets.length > 0) {
            bullets.forEach((li, lIdx) => {
              gsap.from(li, {
                scrollTrigger: {
                  trigger: card,
                  start: 'top 82%'
                },
                y: 16,
                opacity: 0,
                duration: 0.95,
                delay: 0.25 + lIdx * 0.08,
                ease: 'power2.out'
              });
            });
          }
        });
      }

      // 6. Works / Project Bento Grid Cards (#works)
      const workCards = document.querySelectorAll('.work-card');
      if (workCards.length > 0) {
        gsap.from(workCards, {
          scrollTrigger: {
            trigger: '.works-grid',
            start: 'top 82%'
          },
          y: 45,
          scale: 0.96,
          opacity: 0,
          duration: 1.35,
          stagger: 0.22,
          ease: 'power3.out'
        });
      }

      // 7. Milestones Cascading Reveal (#milestones)
      const milestoneCards = document.querySelectorAll('.timeline-card');
      if (milestoneCards.length > 0) {
        gsap.from(milestoneCards, {
          scrollTrigger: {
            trigger: '.timeline-list',
            start: 'top 84%'
          },
          y: 32,
          opacity: 0,
          duration: 1.2,
          stagger: 0.18,
          ease: 'power2.out'
        });
      }

      // 8. Verified Credentials & Certificates Cards (#certs)
      const certCards = document.querySelectorAll('.cert-card');
      if (certCards.length > 0) {
        gsap.from(certCards, {
          scrollTrigger: {
            trigger: '.certs-grid',
            start: 'top 84%'
          },
          y: 35,
          opacity: 0,
          duration: 1.25,
          stagger: 0.18,
          ease: 'power2.out'
        });
      }

      // 9. Selected Writing / Blog Cards (#essays)
      const writingCards = document.querySelectorAll('.writing-card');
      if (writingCards.length > 0) {
        gsap.from(writingCards, {
          scrollTrigger: {
            trigger: '.writing-grid',
            start: 'top 84%'
          },
          y: 35,
          opacity: 0,
          duration: 1.25,
          stagger: 0.18,
          ease: 'power2.out'
        });
      }

      // 10. Contact Section Card (#contact)
      if (document.querySelector('.contact-card')) {
        gsap.from('.contact-card', {
          scrollTrigger: {
            trigger: '#contact',
            start: 'top 82%'
          },
          scale: 0.96,
          y: 32,
          opacity: 0,
          duration: 1.4,
          ease: 'power2.out'
        });
      }

      // 11. Kinetic Number Counters
      initKineticCounters();

      // 12. Interactive 3D Card Spring Tilt
      init3DCardTilt();

      // 13. Magnetic Button Physics
      initMagneticButtons();

    } catch (err) {
      console.warn('GSAP initialization exception, activating fallback:', err);
      initIntersectionFallback();
    }
  } else {
    // C. IntersectionObserver Fallback for offline / blocked CDN environments
    initIntersectionFallback();
  }

  // D. High-Performance ScrollSpy for Active Nav Link
  initScrollSpy();
}

function initIntersectionFallback() {
  const targets = document.querySelectorAll(
    '.credentials-strip, .exec-overview-cols, .variant-dag-container, ' +
    '.exp-item-card, .work-card, .timeline-card, .cert-card, .writing-card, .contact-card'
  );

  if ('IntersectionObserver' in window && targets.length > 0) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

    targets.forEach(el => {
      el.classList.add('scroll-reveal');
      observer.observe(el);
    });
  } else {
    // Immediate fallback display
    targets.forEach(el => el.classList.add('is-visible'));
  }
}

// --- 11.2 KINETIC NUMBER COUNTER ENGINE ---
function initKineticCounters() {
  const visitorEl = document.getElementById('liveVisitorCount');
  if (visitorEl && typeof ScrollTrigger !== 'undefined') {
    ScrollTrigger.create({
      trigger: '.hero-visitor-pill',
      start: 'top 95%',
      once: true,
      onEnter: () => {
        let count = { val: 1000 };
        gsap.to(count, {
          val: 1280,
          duration: 2.2,
          ease: 'power2.out',
          onUpdate: () => {
            visitorEl.textContent = `${Math.floor(count.val).toLocaleString('en-US')}+`;
          }
        });
      }
    });
  }
}

// --- 11.3 TACTILE 3D CARD SPRING TILT (ZERO LAYOUT THRASHING) ---
function init3DCardTilt() {
  const cards = document.querySelectorAll('.exp-item-card, .work-card, .timeline-card, .cert-card, .hero-basic-frame');
  cards.forEach(card => {
    let rect = null;
    let ticking = false;

    card.addEventListener('mouseenter', () => {
      rect = card.getBoundingClientRect();
    });

    card.addEventListener('mousemove', (e) => {
      if (!rect) rect = card.getBoundingClientRect();
      if (!ticking) {
        requestAnimationFrame(() => {
          if (!rect) return;
          const x = e.clientX - rect.left;
          const y = e.clientY - rect.top;
          const centerX = rect.width / 2;
          const centerY = rect.height / 2;
          const rotX = ((y - centerY) / centerY) * -3.8;
          const rotY = ((x - centerX) / centerX) * 3.8;
          card.style.transform = `perspective(1000px) rotateX(${rotX.toFixed(2)}deg) rotateY(${rotY.toFixed(2)}deg) translateY(-3px)`;
          ticking = false;
        });
        ticking = true;
      }
    });

    card.addEventListener('mouseleave', () => {
      rect = null;
      card.style.transform = '';
    });
  });
}

// --- 11.4 MAGNETIC BUTTON CURSOR PHYSICS (HIGH PERFORMANCE QUICKTO) ---
function initMagneticButtons() {
  const btns = document.querySelectorAll('.hero-pill-btn, .nav-cta, .hero-social-btn');
  btns.forEach(btn => {
    let rect = null;
    btn.addEventListener('mouseenter', () => {
      rect = btn.getBoundingClientRect();
    });
    btn.addEventListener('mousemove', (e) => {
      if (!rect) rect = btn.getBoundingClientRect();
      const x = e.clientX - rect.left - rect.width / 2;
      const y = e.clientY - rect.top - rect.height / 2;
      if (typeof gsap !== 'undefined') {
        gsap.to(btn, { x: x * 0.2, y: y * 0.2, duration: 0.15, ease: 'power1.out', overwrite: 'auto' });
      }
    });
    btn.addEventListener('mouseleave', () => {
      rect = null;
      if (typeof gsap !== 'undefined') {
        gsap.to(btn, { x: 0, y: 0, duration: 0.5, ease: 'power2.out', overwrite: 'auto' });
      }
    });
  });
}

// --- 11.5 HIGH-PERFORMANCE SCROLLSPY (ZERO LAYOUT REFLOW) ---
function initScrollSpy() {
  const sections = document.querySelectorAll('section[id]');
  const navLinks = document.querySelectorAll('.nav-links .nav-link');
  if (!sections.length || !navLinks.length) return;

  const setActiveNavLink = (id) => {
    navLinks.forEach(link => {
      const href = link.getAttribute('href');
      if (href === `#${id}`) {
        link.classList.add('active');
      } else if (href && href.startsWith('#')) {
        link.classList.remove('active');
      }
    });
  };

  if (typeof ScrollTrigger !== 'undefined') {
    sections.forEach(sec => {
      const id = sec.getAttribute('id');
      ScrollTrigger.create({
        trigger: sec,
        start: 'top 35%',
        end: 'bottom 35%',
        onEnter: () => setActiveNavLink(id),
        onEnterBack: () => setActiveNavLink(id)
      });
    });
  } else {
    // Throttled Fallback
    let ticking = false;
    window.addEventListener('scroll', () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          const scrollPos = (window.scrollY || document.documentElement.scrollTop) + 120;
          sections.forEach(sec => {
            const top = sec.offsetTop;
            const height = sec.offsetHeight;
            if (scrollPos >= top && scrollPos < top + height) {
              setActiveNavLink(sec.getAttribute('id'));
            }
          });
          ticking = false;
        });
        ticking = true;
      }
    }, { passive: true });
  }
}

// ==========================================================================
// --- 12. 3D ARGENT MASSIF TOPOGRAPHIC TERRAIN (THREE.JS - 120FPS OPTIMIZED) ---
// ==========================================================================
function initArgentMassifScene() {
  const canvas = document.getElementById('argentMassifCanvas');
  const container = document.getElementById('hero3dLandscape');
  if (!canvas || !container || typeof window.THREE === 'undefined') return;

  // Scene & Atmosphere
  const scene = new THREE.Scene();
  const fogColor = 0xFBFBFA;
  scene.fog = new THREE.FogExp2(fogColor, 0.016);

  let width = container.clientWidth || window.innerWidth;
  let height = container.clientHeight || 720;

  const camera = new THREE.PerspectiveCamera(45, width / height, 1, 1000);
  camera.position.set(0, 36, 82);
  camera.lookAt(0, 4, 0);

  // High performance WebGL renderer (120fps optimized fill rate)
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas: canvas,
      alpha: true,
      antialias: false,
      powerPreference: 'high-performance',
      precision: 'mediump'
    });
  } catch (e) {
    console.warn('WebGL initialization failed, 3D landscape unavailable:', e);
    return;
  }

  renderer.setSize(width, height);
  renderer.setPixelRatio(1); // 1:1 hardware pixels for zero GPU fill-rate throttling

  // Geometry: Topographic Height-field Plane (Argent Massif Grid — Optimized 48x32 for locked 120fps)
  const planeWidth = 160;
  const planeHeight = 110;
  const segX = 48;
  const segY = 32;
  const geometry = new THREE.PlaneGeometry(planeWidth, planeHeight, segX, segY);
  geometry.rotateX(-Math.PI / 2.38);

  // Cache base coordinate grid for dynamic displacement
  const posAttr = geometry.attributes.position;
  const count = posAttr.count;
  const basePositions = new Float32Array(count * 3);
  for (let i = 0; i < count * 3; i++) {
    basePositions[i] = posAttr.array[i];
  }

  // Material: Refined silver-slate wireframe (White Theme adaptation of Argent Massif)
  const material = new THREE.MeshBasicMaterial({
    color: 0x94A3B8,
    wireframe: true,
    transparent: true,
    opacity: 0.38
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(16, -10, -8); // Offset toward right to harmonize with portrait frame
  scene.add(mesh);

  // Mouse interaction state with smooth damping
  let mouseX = 0, mouseY = 0;
  let targetX = 0, targetY = 0;

  const onMouseMove = (e) => {
    const halfW = window.innerWidth / 2;
    const halfH = window.innerHeight / 2;
    mouseX = (e.clientX - halfW) / halfW;
    mouseY = (e.clientY - halfH) / halfH;
  };
  window.addEventListener('mousemove', onMouseMove, { passive: true });

  // Responsive window resize
  const onResize = () => {
    if (!container) return;
    width = container.clientWidth;
    height = container.clientHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  };
  window.addEventListener('resize', onResize);

  // Animation Loop: Calm, gradual undulating wave ("từ từ thôi" pacing)
  const clock = new THREE.Clock();
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let frameCount = 0;
  let isVisible = true;
  let rafId = null;

  function renderLoop() {
    if (!isVisible) {
      rafId = null;
      return;
    }

    const time = clock.getElapsedTime() * 0.42; // Slow, majestic wave progression
    frameCount++;

    // Calculate vertex wave displacement every 2 frames to conserve GPU/CPU bandwidth
    if (!prefersReduced && frameCount % 2 === 0) {
      const positions = geometry.attributes.position.array;
      for (let i = 0; i < count; i++) {
        const x = basePositions[i * 3];
        const y = basePositions[i * 3 + 1];

        // Complex harmonic wave formula simulating topographic ridgelines
        const wave1 = Math.sin(x * 0.055 + time * 0.65) * 4.2;
        const wave2 = Math.cos(y * 0.075 + time * 0.48) * 3.4;
        const wave3 = Math.sin((x + y) * 0.035 + time * 0.32) * 2.2;

        // Mountain Massif crest ridge elevation
        const ridge1 = Math.exp(-((x - 12) * (x - 12)) / 1200) * 8.5;
        const ridge2 = Math.exp(-((y + 8) * (y + 8)) / 900) * 3.8;

        positions[i * 3 + 2] = (wave1 + wave2 + wave3) * 0.75 + ridge1 + ridge2;
      }
      geometry.attributes.position.needsUpdate = true;
    }

    // Smooth rotational damping reacting to user's cursor
    targetX += (mouseX * 0.08 - targetX) * 0.025;
    targetY += (mouseY * 0.05 - targetY) * 0.025;

    mesh.rotation.z = targetX * 0.25;
    mesh.rotation.y = targetX * 0.18;
    mesh.rotation.x = -Math.PI / 2.38 + targetY * 0.18;

    renderer.render(scene, camera);
    rafId = requestAnimationFrame(renderLoop);
  }

  function startLoop() {
    if (!rafId && isVisible) {
      rafId = requestAnimationFrame(renderLoop);
    }
  }

  function stopLoop() {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  // IntersectionObserver: Complete pause of 3D loop when Hero scrolls out of view
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      isVisible = entries[0].isIntersecting;
      if (isVisible) {
        startLoop();
      } else {
        stopLoop();
      }
    }, { threshold: 0.02 });
    observer.observe(container);
  }

  startLoop();
}




