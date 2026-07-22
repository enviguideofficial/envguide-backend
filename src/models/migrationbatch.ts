// import client from "../util/database";
import { withClient } from '../util/database.js';

export async function mirgation() {
    const createTableQueries = [
        `CREATE TABLE IF NOT EXISTS users_table
        (
            user_id
            VARCHAR
         (
            255
         ) PRIMARY KEY,
            user_name VARCHAR
         (
             255
         ),
            user_role_id VARCHAR
         (
             255
         ),
            user_role VARCHAR
         (
             255
         ),
            user_email VARCHAR
         (
             255
         ),
            user_password VARCHAR
         (
             255
         ),
            user_phone_number VARCHAR
         (
             255
         ),
            user_department VARCHAR
         (
             255
         ),
            change_password_next_login BOOLEAN DEFAULT false,
            password_never_expires BOOLEAN DEFAULT false,
            password_expiry_date DATE,
            pos_id VARCHAR
         (
             255
         ),
            FOREIGN KEY( user_role_id ) REFERENCES roles_table ( role_id ),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            )`,

        `CREATE TABLE IF NOT EXISTS users_permission_table
        (
            permission_id
            VARCHAR
         (
            255
         ) PRIMARY KEY,
            module_name VARCHAR
         (
             255
         ),
            module_id VARCHAR
         (
             255
         ),
            user_id VARCHAR
         (
             255
         ),
            "create" BOOLEAN DEFAULT false,
            "update" BOOLEAN DEFAULT false,
            "delete" BOOLEAN DEFAULT false,
            "print" BOOLEAN DEFAULT false,
            "export" BOOLEAN DEFAULT false,
            "send" BOOLEAN DEFAULT false,
            "read" BOOLEAN DEFAULT true,
            "all" BOOLEAN DEFAULT false,
            FOREIGN KEY
         (
             user_id
         ) REFERENCES users_table
         (
             user_id
         ),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            )`,

        ` CREATE TABLE IF NOT EXISTS roles_table
        ( 
        role_id VARCHAR  ( 255 ) PRIMARY KEY,
            role_name VARCHAR ( 255) UNIQUE,
            description VARCHAR ( 255),
            role_code VARCHAR (255),
            created_by VARCHAR (255),
            updated_by VARCHAR (255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            )`,

        ` CREATE TABLE IF NOT EXISTS department_table
        (
            department_id VARCHAR  ( 255) PRIMARY KEY,
            department_name VARCHAR  (  255 ) UNIQUE,
            description VARCHAR( 255 ),
            department_code VARCHAR (255),
            created_by VARCHAR (255),
            updated_by VARCHAR (255),
            roles_id TEXT[],
            is_mapping BOOLEAN DEFAULT false,
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            )`,

        ` CREATE TABLE IF NOT EXISTS module_table
        (
            module_id
            VARCHAR
          (
            255
          ) PRIMARY KEY,
            module_name VARCHAR
          (
              255
          ) UNIQUE,
            description VARCHAR
          (
              255
          ),
            main_module_id VARCHAR
          (
              255
          ),
            FOREIGN KEY
          (
              main_module_id
          ) REFERENCES main_module_table
          (
              main_module_id
          ),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            )`,

        ` CREATE TABLE IF NOT EXISTS submodule_table (
    submodule_id VARCHAR(255) PRIMARY KEY,
    submodule_name VARCHAR(255) UNIQUE,
    description VARCHAR(255),
    module_id VARCHAR(255),
    FOREIGN KEY (module_id) REFERENCES module_table(module_id),
    update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
)`,

        ` CREATE TABLE IF NOT EXISTS main_module_table
        (
            main_module_id
            VARCHAR
          (
            255
          ) PRIMARY KEY,
            main_module_name VARCHAR
          (
              255
          ) UNIQUE,
            description VARCHAR
          (
              255
          ),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            )`,

        `CREATE TABLE IF NOT EXISTS document_type_table (
            document_id VARCHAR(50) ,
            document_type_name VARCHAR(50) ,  
            update_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_by VARCHAR(255),
            created_by VARCHAR(255)
          )`,

        `CREATE TABLE IF NOT EXISTS whatsapp_config (
      id VARCHAR(255) PRIMARY KEY,
      api_key VARCHAR(255),
      api_url VARCHAR(255),
      user_name VARCHAR(255),
      password VARCHAR(255),
      number VARCHAR(255),
      update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );`,

        `ALTER TABLE whatsapp_config
ADD COLUMN IF NOT EXISTS template_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS api_version VARCHAR(255),
ADD COLUMN IF NOT EXISTS phone_number_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS language VARCHAR(255),
ADD COLUMN IF NOT EXISTS event_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS platform VARCHAR(255);

`,
        `CREATE TABLE IF NOT EXISTS sms_config (
      id VARCHAR(255) PRIMARY KEY,
      api_key VARCHAR(255),
      api_url VARCHAR(255),
      user_name VARCHAR(255),
      password VARCHAR(255),
      template_id VARCHAR(255),
      sender_id VARCHAR(255),
      event_name VARCHAR(255),
      path VARCHAR(255),
      platform VARCHAR(255),
      update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );`,

        `ALTER TABLE sms_config
ADD COLUMN IF NOT EXISTS template_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS sender_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS event_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS path VARCHAR(255),
ADD COLUMN IF NOT EXISTS platform VARCHAR(255);
`,


        `CREATE TABLE IF NOT EXISTS email_config (
            id VARCHAR(255) PRIMARY KEY,
            smtp_host VARCHAR(255),       
            smtp_port VARCHAR(255),
            smtp_user VARCHAR(255),
            smtp_password VARCHAR(255),
            smtp_secure VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );`,

        `CREATE TABLE IF NOT EXISTS user_mfa_secret (
            id VARCHAR(255) PRIMARY KEY,
            user_id VARCHAR(255),       
            user_email VARCHAR(255),
            mfa_secret VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );`,

        `CREATE TABLE IF NOT EXISTS own_emission (
            id VARCHAR(255) PRIMARY KEY,
            code VARCHAR(255), 
            product_id VARCHAR(255),
            bom_pcf_id VARCHAR(255),
            is_quetions_filled BOOLEAN DEFAULT FALSE,  
            supporting_document_ids VARCHAR(255)[], 
            own_emission_status VARCHAR(255),  
            additional_notes TEXT,
            client_id VARCHAR(255),
            is_own_emission_calculated BOOLEAN DEFAULT FALSE,
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );`,

        `CREATE TABLE IF NOT EXISTS own_emission_supporting_document (
            id VARCHAR(255) PRIMARY KEY,
            own_emission_id VARCHAR(255),      
            document text,
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );`,

        `CREATE TABLE IF NOT EXISTS own_emission_supporting_team (
            id VARCHAR(255) PRIMARY KEY,
            own_emission_id VARCHAR(255),
            full_name VARCHAR(255),      
            phone_number VARCHAR(255), 
            email_address VARCHAR(255), 
            message text,
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );`,

        `CREATE TABLE IF NOT EXISTS document_master (
            id VARCHAR(255) PRIMARY KEY,
            code VARCHAR(255),
            document_type VARCHAR(255),      
            category VARCHAR(255), 
            product_code VARCHAR(255), 
            version VARCHAR(255), 
            document_title VARCHAR(255), 
            description text,
            tags VARCHAR(255)[], 
            access_level VARCHAR(255), 
            document text[],
            status VARCHAR(255) DEFAULT 'Pending', 
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            file_size VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );`,

        `CREATE TABLE IF NOT EXISTS product (
            id VARCHAR(255) PRIMARY KEY,
            product_code VARCHAR(255),
            product_name VARCHAR(255),  
            product_category_id VARCHAR(255), 
            product_sub_category_id VARCHAR(255), 
            description text,
            ts_weight_kg DOUBLE PRECISION,
            ts_dimensions VARCHAR(255),
            ts_material TEXT,
            ts_manufacturing_process_id VARCHAR(255), 
            ts_supplier VARCHAR(255),
            ts_part_number VARCHAR(255),
            ed_estimated_pcf DOUBLE PRECISION,
            ed_recyclability DOUBLE PRECISION,
            ed_life_cycle_stage_id VARCHAR(255), 
            ed_renewable_energy DOUBLE PRECISION,
            pcf_status VARCHAR(255) DEFAULT 'Not Available',
            product_status VARCHAR(255),
            client_or_manufacturer_ids VARCHAR(255)[],
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );`,

        `CREATE TABLE IF NOT EXISTS bom_pcf_request (
            id VARCHAR(255) PRIMARY KEY,
            code VARCHAR(255) DEFAULT ('PCF' || LPAD(nextval('pcf_code_seq')::text, 5, '0')) UNIQUE,  
            request_title VARCHAR(255),
            priority VARCHAR(255),
            request_organization VARCHAR(255),
            due_date TIMESTAMPTZ,
            request_description TEXT,
            product_category_id VARCHAR(255),
            component_category_id VARCHAR(255),
            component_type_id VARCHAR(255),
            product_code VARCHAR(255),
            manufacturer_id VARCHAR(255),
            model_version VARCHAR(255),
            client_id VARCHAR(255),
            is_client BOOLEAN DEFAULT false,
            is_approved BOOLEAN DEFAULT false,
            is_rejected BOOLEAN DEFAULT false,
            is_draft BOOLEAN DEFAULT false,
            is_task_created BOOLEAN DEFAULT false,
            technical_specification_file TEXT[],
            status VARCHAR(255) DEFAULT 'Inprogress',
            product_images TEXT[],
            created_by VARCHAR(255),
            rejected_by VARCHAR(255),
            reject_reason TEXT,
            updated_by VARCHAR(255),
            overall_pcf DOUBLE PRECISION,
            overall_own_emission_pcf DOUBLE PRECISION,
            is_own_emission_calculated BOOLEAN DEFAULT FALSE,
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );`,

        `CREATE TABLE IF NOT EXISTS bom_pcf_request_product_specification (
            id VARCHAR(255) PRIMARY KEY,    
            bom_pcf_id VARCHAR(255),
            specification_name VARCHAR(255),
            specification_value VARCHAR(255),
            specification_unit VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );`,

        `CREATE TABLE IF NOT EXISTS bom (
            id VARCHAR(255) PRIMARY KEY,
            code VARCHAR(255) DEFAULT ('BOM' || LPAD(nextval('bom_code_seq')::text, 5, '0')) UNIQUE,
            bom_pcf_id VARCHAR(255),
            material_number VARCHAR(255),      
            component_name VARCHAR(255), 
            qunatity INTEGER, 
            production_location VARCHAR(255), 
            manufacturer VARCHAR(255),
            detail_description TEXT,
            weight_gms DOUBLE PRECISION, 
            total_weight_gms DOUBLE PRECISION, 
            component_category VARCHAR(255),
            price DOUBLE PRECISION, 
            total_price DOUBLE PRECISION,
            economic_ratio DOUBLE PRECISION,
            is_bom_calculated BOOLEAN DEFAULT false,
            supplier_id VARCHAR(255),
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            is_weight_gms BOOLEAN DEFAULT false,
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );`,

        `CREATE TABLE IF NOT EXISTS bom_emission_material_calculation_engine (
            id VARCHAR(255) PRIMARY KEY,
            bom_id VARCHAR(255),
            product_id VARCHAR(255),  
            product_bom_pcf_id VARCHAR(255),
            material_type VARCHAR(255),
            material_composition DOUBLE PRECISION,
            material_composition_weight DOUBLE PRECISION,
            material_emission_factor DOUBLE PRECISION,
            material_emission DOUBLE PRECISION,
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );`,

        `CREATE TABLE IF NOT EXISTS bom_emission_production_calculation_engine (
            id VARCHAR(255) PRIMARY KEY,
            bom_id VARCHAR(255), 
            product_id VARCHAR(255),  
            product_bom_pcf_id VARCHAR(255),
            component_weight_kg DOUBLE PRECISION,
            allocation_methodology VARCHAR(255),
            total_electrical_energy_consumed_at_factory_level_kWh DOUBLE PRECISION,
            total_heating_energy_consumed_at_factory_level_kWh DOUBLE PRECISION,
            total_cooling_energy_consumed_at_factory_level_kWh DOUBLE PRECISION,
            total_steam_energy_consumed_at_factory_level_kWh DOUBLE PRECISION,
            total_energy_consumed_at_factory_level_kWh DOUBLE PRECISION,
            total_weight_produced_at_factory_level_kg DOUBLE PRECISION,
            no_of_products_current_component_produced DOUBLE PRECISION,
            total_weight_of_current_component_produced_kg DOUBLE PRECISION,
            total_electricity_utilised_for_production_all_current_components_kWh DOUBLE PRECISION,
            production_electricity_energy_use_per_unit_kWh DOUBLE PRECISION,
            production_heat_energy_use_per_unit_kWh DOUBLE PRECISION,
            production_cooling_energy_use_per_unit_kWh DOUBLE PRECISION,
            production_steam_energy_use_per_unit_kWh DOUBLE PRECISION,
            emission_factor_of_electricity DOUBLE PRECISION,
            emission_factor_of_heat DOUBLE PRECISION,
            emission_factor_of_cooling DOUBLE PRECISION,
            emission_factor_of_steam DOUBLE PRECISION,
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );`,

        `CREATE TABLE IF NOT EXISTS bom_emission_packaging_calculation_engine (
            id VARCHAR(255) PRIMARY KEY,
            bom_id VARCHAR(255),    
            product_id VARCHAR(255),   
            product_bom_pcf_id VARCHAR(255), 
            pack_weight_kg DOUBLE PRECISION,
            emission_factor_box_kg  DOUBLE PRECISION,
            pack_size_l_w_h_m VARCHAR(255),
            packaging_type VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );`,

        `CREATE TABLE IF NOT EXISTS bom_emission_logistic_calculation_engine (
            id VARCHAR(255) PRIMARY KEY,
            bom_id VARCHAR(255),  
            product_id VARCHAR(255),   
            product_bom_pcf_id VARCHAR(255),
            mode_of_transport VARCHAR(255), 
            mass_transported_kg DOUBLE PRECISION,
            mass_transported_ton DOUBLE PRECISION,
            distance_km DOUBLE PRECISION,
            transport_mode_emission_factor_value_kg_co2e_t_km DOUBLE PRECISION,
            leg_wise_transport_emissions_per_unit_kg_co2e DOUBLE PRECISION,
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );`,

        `CREATE TABLE IF NOT EXISTS bom_emission_waste_calculation_engine (
            id VARCHAR(255) PRIMARY KEY,
            bom_id VARCHAR(255),      
            product_id VARCHAR(255),  
            product_bom_pcf_id VARCHAR(255),
            waste_generated_per_box_kg DOUBLE PRECISION,
            emission_factor_box_waste_treatment_kg_co2e_kg DOUBLE PRECISION,
            emission_factor_packaging_waste_treatment_kg_co2e_kWh DOUBLE PRECISION,
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );`,

        `CREATE TABLE IF NOT EXISTS bom_emission_calculation_engine (
            id VARCHAR(255) PRIMARY KEY,
            bom_id VARCHAR(255),      
            product_id VARCHAR(255),  
            product_bom_pcf_id VARCHAR(255),
            material_value DOUBLE PRECISION,
            production_value DOUBLE PRECISION,
            packaging_value DOUBLE PRECISION,
            logistic_value DOUBLE PRECISION,
            waste_value DOUBLE PRECISION,
            total_pcf_value DOUBLE PRECISION,
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );`,

        `CREATE TABLE IF NOT EXISTS allocation_methodology (
            id VARCHAR(255) PRIMARY KEY,
            bom_id VARCHAR(255) UNIQUE,  
            product_id VARCHAR(255), 
            product_bom_pcf_id VARCHAR(255),
            split_allocation BOOLEAN DEFAULT false,   
            sys_expansion_allocation BOOLEAN DEFAULT false,
            check_er_less_than_five VARCHAR(255),
            phy_mass_allocation_er_less_than_five VARCHAR(255),
            econ_allocation_er_greater_than_five VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );`,

        `CREATE TABLE IF NOT EXISTS task_managment (
            id VARCHAR(255) PRIMARY KEY,
            code VARCHAR(255) DEFAULT ('TASK' || LPAD(nextval('task_code_seq')::text, 5, '0')) UNIQUE,      
            task_title VARCHAR(255),
            category_id VARCHAR(255),
            bom_pcf_id VARCHAR(255),
            priority VARCHAR(255),
            assign_to VARCHAR(255)[],
            due_date TIMESTAMPTZ,
            description TEXT,
            product VARCHAR(255),
            estimated_hour INTEGER,
            tags VARCHAR(255)[],
            attachments TEXT,
            progress VARCHAR(255),
            status VARCHAR(255) DEFAULT 'Created',
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );`,

        `CREATE TABLE IF NOT EXISTS pcf_bom_comments (
            id VARCHAR(255) PRIMARY KEY,
            bom_pcf_id VARCHAR(255),  
            user_id VARCHAR(255),
            comment TEXT,  
            commented_at TIMESTAMPTZ,   
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );`,

        //===========> PCF Request Stages Tables start<============

        `CREATE TABLE IF NOT EXISTS pcf_request_stages (
            id VARCHAR(255) PRIMARY KEY,
            bom_pcf_id VARCHAR(255),
            client_id VARCHAR(255),
            own_emission_id VARCHAR(255),
            is_pcf_request_created BOOLEAN DEFAULT FALSE,
            is_pcf_request_submitted BOOLEAN DEFAULT FALSE,
            is_bom_verified BOOLEAN DEFAULT FALSE,
            is_data_collected BOOLEAN DEFAULT FALSE,
            is_dqr_completed BOOLEAN DEFAULT FALSE,
            is_pcf_calculated BOOLEAN DEFAULT FALSE,
            is_result_validation_verified BOOLEAN DEFAULT FALSE,
            is_result_submitted BOOLEAN DEFAULT FALSE,
            pcf_request_created_by VARCHAR(255),
            pcf_request_submitted_by VARCHAR(255),
            bom_verified_by VARCHAR(255),
            dqr_completed_by VARCHAR(255),
            pcf_calculated_by VARCHAR(255) DEFAULT 'system',
            result_validation_verified_by VARCHAR(255),
            result_submitted_by VARCHAR(255),
            pcf_request_created_date TIMESTAMPTZ,
            pcf_request_submitted_date TIMESTAMPTZ,
            bom_verified_date TIMESTAMPTZ,
            dqr_completed_date TIMESTAMPTZ,
            pcf_calculated_date TIMESTAMPTZ,
            result_validation_verified_date TIMESTAMPTZ,
            result_submitted_date TIMESTAMPTZ,
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );`,

        //   this below table for more than supplier input quetions is right so data collection stage
        `CREATE TABLE IF NOT EXISTS pcf_request_data_collection_stage (
            id VARCHAR(255) PRIMARY KEY,
            bom_pcf_id VARCHAR(255),
            bom_id VARCHAR(255),
            sup_id VARCHAR(255),
            client_id VARCHAR(255),
            own_emission_id VARCHAR(255),
            is_submitted BOOLEAN DEFAULT FALSE,
            is_question_clicked BOOLEAN DEFAULT FALSE,
            completed_date TIMESTAMPTZ,
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );`,

        `CREATE TABLE IF NOT EXISTS pcf_request_data_rating_stage (
            id VARCHAR(255) PRIMARY KEY,
            bom_pcf_id VARCHAR(255),
            bom_id VARCHAR(255),
            sup_id VARCHAR(255),
            client_id VARCHAR(255),
            own_emission_id VARCHAR(255),
            submitted_by VARCHAR(255),
            is_submitted BOOLEAN DEFAULT FALSE,
            completed_date TIMESTAMPTZ,
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );`,

        //========>PCF Request Stages Tables end<============

        //   =======>Supplier Organization Questionnaire Tables<==========

        `CREATE TABLE IF NOT EXISTS supplier_details (
            sup_id VARCHAR(255) PRIMARY KEY,   
            code VARCHAR(255) DEFAULT ('SUP' || LPAD(nextval('supplier_code_seq')::text, 5, '0')) UNIQUE,  
            supplier_name VARCHAR(255),
            supplier_email VARCHAR(255) UNIQUE,
            supplier_phone_number VARCHAR(255),
            supplier_alternate_phone_number VARCHAR(255),
            supplier_gender VARCHAR(50),
            supplier_date_of_birth DATE,
            supplier_image TEXT,
            supplier_company_logo TEXT,
            supplier_company_website VARCHAR(255),
            supplier_company_name VARCHAR(255),
            supplier_business_type VARCHAR(255),
            supplier_supplied_categories TEXT[],
            supplier_years_in_business VARCHAR(255),
            supplier_city VARCHAR(255),
            supplier_state VARCHAR(255),
            supplier_country VARCHAR(255),
            supplier_registered_address TEXT,
            supplier_gst_number VARCHAR(255),
            supplier_pan_number VARCHAR(255),
            supplier_bank_account_number VARCHAR(255),
            supplier_ifsc_code VARCHAR(255),
            supplier_bank_name VARCHAR(255),
            supplier_bank_branch VARCHAR(255),
            supplier_key_automotive_clients TEXT[],
            supplier_business_registration_certificate TEXT[],
            supplier_tax_registration_proof TEXT[],
            supplier_product_catalogue TEXT[],
            supplier_additional_supporting_documents TEXT[],
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );`,

        //   Gneral Info Questions
        `CREATE TABLE IF NOT EXISTS supplier_general_info_questions (
            sgiq_id VARCHAR(255) PRIMARY KEY,
            bom_pcf_id VARCHAR(255), 
            ere_acknowledge BOOLEAN DEFAULT false,
            repm_acknowledge BOOLEAN DEFAULT false,
            dc_acknowledge BOOLEAN DEFAULT false,
            organization_name VARCHAR(255),   
            core_business_activitiy VARCHAR(255),
            specify_other_activity VARCHAR(255),
            designation VARCHAR(255),
            email_address VARCHAR(255),
            no_of_employees VARCHAR(255), 
            specify_other_no_of_employees VARCHAR(255), 
            annual_revenue VARCHAR(255),
            specify_other_annual_revenue VARCHAR(255),
            annual_reporting_period VARCHAR(255),
            availability_of_scope_one_two_three_emissions_data BOOLEAN DEFAULT false,
            sup_id VARCHAR(255),
            client_id VARCHAR(255),
            own_emission_id VARCHAR(255),
            updated_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );`,

        `CREATE TABLE IF NOT EXISTS availability_of_scope_one_two_three_emissions_questions (
            aosotte_id VARCHAR(255) PRIMARY KEY,
            sgiq_id VARCHAR(255),   
            country_iso_three VARCHAR(255),
            scope_one BIGINT,
            scope_two BIGINT,
            scope_three BIGINT,
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(sgiq_id) REFERENCES supplier_general_info_questions (sgiq_id)
  );`,

        //   Product Questions
        `CREATE TABLE IF NOT EXISTS supplier_product_questions (
            spq_id VARCHAR(255) PRIMARY KEY,
            sgiq_id VARCHAR(255),
            do_you_have_an_existing_pcf_report BOOLEAN DEFAULT false,
            pcf_methodology_used TEXT[], -- ['ISO 14067', 'GHG Protocol', 'Catena-X PCF Guideline', etc.]
            upload_pcf_report TEXT[], -- document link or file reference
            required_environmental_impact_methods TEXT[], -- ['Life Cycle Assessment (LCA)', 'Carbon Footprint', 'Water Footprint', etc.]
            any_co_product_have_economic_value BOOLEAN DEFAULT false,
            sup_id VARCHAR(255),
            updated_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(sgiq_id) REFERENCES supplier_general_info_questions (sgiq_id)
  );`,

        `CREATE TABLE IF NOT EXISTS production_site_details_questions (
            psd_id VARCHAR(255) PRIMARY KEY,
            spq_id VARCHAR(255),
            bom_id VARCHAR(255),  
            product_id VARCHAR(255),
            product_bom_pcf_id VARCHAR(255),
            material_number VARCHAR(255),   
            product_name VARCHAR(255),
            location TEXT,
            detailed_location TEXT,
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(spq_id) REFERENCES supplier_product_questions (spq_id)
  );`,

        `CREATE TABLE IF NOT EXISTS product_component_manufactured_questions (
            pcm_id VARCHAR(255) PRIMARY KEY,
            spq_id VARCHAR(255),   
            bom_id VARCHAR(255),  
            product_id VARCHAR(255),
            product_bom_pcf_id VARCHAR(255),
            material_number VARCHAR(255),
            product_name VARCHAR(255),
            production_period VARCHAR(255),
            weight_per_unit NUMERIC(10,2),
            unit VARCHAR(50),
            price NUMERIC(10,2),
            quantity INTEGER,
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(spq_id) REFERENCES supplier_product_questions (spq_id)
  );`,

        `CREATE TABLE IF NOT EXISTS co_product_component_economic_value_questions (
            cpcev_id VARCHAR(255) PRIMARY KEY,
            spq_id VARCHAR(255), 
            bom_id VARCHAR(255),  
            product_id VARCHAR(255),
            product_bom_pcf_id VARCHAR(255),
            material_number VARCHAR(255),
            product_name VARCHAR(255),  
            co_product_name VARCHAR(255),
            weight NUMERIC(10,2),
            price_per_product NUMERIC(10,2),
            quantity INTEGER,
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(spq_id) REFERENCES supplier_product_questions (spq_id)
  );`,

        //   Scope One Direct Emissions Questions
        `CREATE TABLE IF NOT EXISTS scope_one_direct_emissions_questions (
            sode_id VARCHAR(255) PRIMARY KEY,
            sgiq_id VARCHAR(255),
            refrigerant_top_ups_performed BOOLEAN DEFAULT false,
            industrial_process_emissions_present BOOLEAN DEFAULT false,
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(sgiq_id) REFERENCES supplier_general_info_questions (sgiq_id)
  );`,

        `CREATE TABLE IF NOT EXISTS stationary_combustion_on_site_energy_use_questions (
            scoseu_id VARCHAR(255) PRIMARY KEY,
            sode_id VARCHAR(255),
            fuel_type VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(sode_id) REFERENCES scope_one_direct_emissions_questions (sode_id)
  );`,

        `CREATE TABLE IF NOT EXISTS scoseu_sub_fuel_type_questions (
            ssft_id VARCHAR(255) PRIMARY KEY,
            scoseu_id VARCHAR(255),
            sub_fuel_type VARCHAR(255),
            consumption_quantity NUMERIC(10,2),
            unit VARCHAR(50),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(scoseu_id) REFERENCES stationary_combustion_on_site_energy_use_questions (scoseu_id)
  );`,

        `CREATE TABLE IF NOT EXISTS mobile_combustion_company_owned_vehicles_questions (
            mccov_id VARCHAR(255) PRIMARY KEY,
            sode_id VARCHAR(255),
            fuel_type VARCHAR(255),
            quantity INTEGER,
            unit VARCHAR(50), 
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(sode_id) REFERENCES scope_one_direct_emissions_questions (sode_id)
  );`,

        `CREATE TABLE IF NOT EXISTS refrigerants_questions (
            refr_id VARCHAR(255) PRIMARY KEY,
            sode_id VARCHAR(255),
            refrigerant_type VARCHAR(255),
            quantity INTEGER,
            unit VARCHAR(50), 
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(sode_id) REFERENCES scope_one_direct_emissions_questions (sode_id)
  );`,

        `CREATE TABLE IF NOT EXISTS process_emissions_sources_questions (
            pes_id VARCHAR(255) PRIMARY KEY,
            sode_id VARCHAR(255),
            source VARCHAR(255),
            gas_type VARCHAR(255),
            quantity INTEGER,
            unit VARCHAR(50), 
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(sode_id) REFERENCES scope_one_direct_emissions_questions (sode_id)
  );`,


        //Scope Two Indirect Emissions from Purchased Energy Questions

        `CREATE TABLE IF NOT EXISTS scope_two_indirect_emissions_questions (
            stide_id VARCHAR(255) PRIMARY KEY,
            sgiq_id VARCHAR(255),
            do_you_acquired_standardized_re_certificates BOOLEAN DEFAULT false,
            methodology_to_allocate_factory_energy_to_product_level BOOLEAN DEFAULT false,
            methodology_details_document_url TEXT[], -- array of document links or file references
            energy_intensity_of_production_estimated_kwhor_mj BOOLEAN DEFAULT false,
            process_specific_energy_usage BOOLEAN DEFAULT false,
            do_you_use_any_abatement_systems BOOLEAN DEFAULT false,
            water_consumption_and_treatment_details TEXT,
            do_you_perform_destructive_testing BOOLEAN DEFAULT false,
            it_system_use_for_production_control TEXT[], 
            total_energy_consumption_of_it_hardware_production BOOLEAN DEFAULT false,
            energy_con_included_total_energy_pur_sec_two_qfortythree BOOLEAN DEFAULT false, --Q43
            do_you_use_cloud_based_system_for_production BOOLEAN DEFAULT false,
            do_you_use_any_cooling_sysytem_for_server BOOLEAN DEFAULT false,
            energy_con_included_total_energy_pur_sec_two_qfifty BOOLEAN DEFAULT false, --Q50
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(sgiq_id) REFERENCES supplier_general_info_questions (sgiq_id)
  );`,

        `CREATE TABLE IF NOT EXISTS scope_two_indirect_emissions_from_purchased_energy_questions (
            stidefpe_id VARCHAR(255) PRIMARY KEY,
            stide_id VARCHAR(255),
            energy_source VARCHAR(255),
            energy_type VARCHAR(255),
            quantity NUMERIC(10,2),
            unit VARCHAR(50),
            sup_id VARCHAR(255),
            client_id VARCHAR(255),
            own_emission_id VARCHAR(255),
            annual_reporting_period VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(stide_id) REFERENCES scope_two_indirect_emissions_questions (stide_id)
  );`,

        `CREATE TABLE IF NOT EXISTS scope_two_indirect_emissions_certificates_questions (
            stidec_id VARCHAR(255) PRIMARY KEY,
            stide_id VARCHAR(255),
            certificate_name VARCHAR(255),
            mechanism VARCHAR(255),
            serial_id VARCHAR(255),
            generator_id VARCHAR(255),
            generator_name VARCHAR(255),
            generator_location TEXT,
            date_of_generation TIMESTAMPTZ,
            issuance_date TIMESTAMPTZ,
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(stide_id) REFERENCES scope_two_indirect_emissions_questions (stide_id)
  );`,

        `CREATE TABLE IF NOT EXISTS energy_intensity_of_production_estimated_kwhor_mj_questions (
            eiopekm_id VARCHAR(255) PRIMARY KEY,
            stide_id VARCHAR(255),
            bom_id VARCHAR(255),  
            product_id VARCHAR(255),
            product_bom_pcf_id VARCHAR(255),
            material_number VARCHAR(255),
            product_name VARCHAR(255),
            energy_intensity NUMERIC(10,2),
            unit VARCHAR(50),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(stide_id) REFERENCES scope_two_indirect_emissions_questions (stide_id)
  );`,

        `CREATE TABLE IF NOT EXISTS process_specific_energy_usage_questions (
            pseu_id VARCHAR(255) PRIMARY KEY,
            stide_id VARCHAR(255),
            bom_id VARCHAR(255),
            material_number VARCHAR(255),
            process_specific_energy_type VARCHAR(255),
            energy_type VARCHAR(255),
            quantity_consumed NUMERIC(10,2),
            unit VARCHAR(50),
            support_from_enviguide BOOLEAN DEFAULT false,
            annual_reporting_period VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(stide_id) REFERENCES scope_two_indirect_emissions_questions (stide_id)
  );`,

        `CREATE TABLE IF NOT EXISTS abatement_systems_used_questions (
            asu_id VARCHAR(255) PRIMARY KEY,
            stide_id VARCHAR(255),
            source VARCHAR(255),
            quantity NUMERIC(10,2),
            unit VARCHAR(50),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(stide_id) REFERENCES scope_two_indirect_emissions_questions (stide_id)
  );`,
        // Q32
        `CREATE TABLE IF NOT EXISTS type_of_quality_control_equipment_usage_questions (
            toqceu_id VARCHAR(255) PRIMARY KEY,
            stide_id VARCHAR(255),
            equipment_name VARCHAR(255),
            quantity NUMERIC(10,2),
            unit VARCHAR(50),
            avg_operating_hours_per_month VARCHAR(50),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(stide_id) REFERENCES scope_two_indirect_emissions_questions (stide_id)
  );`,
        // Q33
        `CREATE TABLE IF NOT EXISTS electricity_consumed_for_quality_control_questions (
            ecfqc_id VARCHAR(255) PRIMARY KEY,
            stide_id VARCHAR(255),
            energy_type VARCHAR(255),
            quantity NUMERIC(10,2),
            unit VARCHAR(50),
            period VARCHAR(50),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(stide_id) REFERENCES scope_two_indirect_emissions_questions (stide_id)
  );`,
        // Q34
        `CREATE TABLE IF NOT EXISTS quality_control_process_usage_questions (
            qcpu_id VARCHAR(255) PRIMARY KEY,
            stide_id VARCHAR(255),
            process_name VARCHAR(255),
            quantity NUMERIC(10,2),
            unit VARCHAR(50),
            period VARCHAR(50),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(stide_id) REFERENCES scope_two_indirect_emissions_questions (stide_id)
  );`,
        // Q34
        `CREATE TABLE IF NOT EXISTS quality_control_process_usage_pressure_or_flow_questions (
            qcpupf_id VARCHAR(255) PRIMARY KEY,
            stide_id VARCHAR(255),
            flow_name VARCHAR(255),
            quantity NUMERIC(10,2),
            unit VARCHAR(50),
            period VARCHAR(50),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(stide_id) REFERENCES scope_two_indirect_emissions_questions (stide_id)
  );`,
        // Q35
        `CREATE TABLE IF NOT EXISTS quality_control_use_any_consumables_questions (
            qcuac_id VARCHAR(255) PRIMARY KEY,
            stide_id VARCHAR(255),
            consumable_name VARCHAR(255),
            mass_of_consumables NUMERIC(10,2),
            unit VARCHAR(50),
            period VARCHAR(50),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(stide_id) REFERENCES scope_two_indirect_emissions_questions (stide_id)
  );`,
        // Q37
        `CREATE TABLE IF NOT EXISTS weight_of_samples_destroyed_questions (
            wosd_id VARCHAR(255) PRIMARY KEY,
            stide_id VARCHAR(255),
            bom_id VARCHAR(255),  
            product_id VARCHAR(255),
            product_bom_pcf_id VARCHAR(255),
            material_number VARCHAR(255),
            component_name VARCHAR(255),
            weight NUMERIC(10,2),
            unit VARCHAR(50),
            period VARCHAR(50),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(stide_id) REFERENCES scope_two_indirect_emissions_questions (stide_id)
  );`,
        // Q38
        `CREATE TABLE IF NOT EXISTS defect_or_rejection_rate_identified_by_quality_control_questions (
            dorriqc_id VARCHAR(255) PRIMARY KEY,
            stide_id VARCHAR(255),
            bom_id VARCHAR(255),  
            product_id VARCHAR(255),
            product_bom_pcf_id VARCHAR(255),
            material_number VARCHAR(255),
            component_name VARCHAR(255),
            percentage VARCHAR(50),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(stide_id) REFERENCES scope_two_indirect_emissions_questions (stide_id)
  );`,
        // Q39
        `CREATE TABLE IF NOT EXISTS rework_rate_due_to_quality_control_questions (
            rrdqc_id VARCHAR(255) PRIMARY KEY,
            stide_id VARCHAR(255),
            bom_id VARCHAR(255),  
            product_id VARCHAR(255),
            product_bom_pcf_id VARCHAR(255),
            material_number VARCHAR(255),
            component_name VARCHAR(255),
            processes_involved VARCHAR(255),
            percentage VARCHAR(50),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(stide_id) REFERENCES scope_two_indirect_emissions_questions (stide_id)
  );`,
        // Q40
        `CREATE TABLE IF NOT EXISTS weight_of_quality_control_waste_generated_questions (
            woqcwg_id VARCHAR(255) PRIMARY KEY,
            stide_id VARCHAR(255),
            bom_id VARCHAR(255),  
            product_id VARCHAR(255),
            product_bom_pcf_id VARCHAR(255),
            material_number VARCHAR(255),
            component_name VARCHAR(255),
            waste_type VARCHAR(255),
            waste_weight VARCHAR(255),
            unit VARCHAR(50),
            treatment_type VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(stide_id) REFERENCES scope_two_indirect_emissions_questions (stide_id)
  );`,
        // Q44
        `CREATE TABLE IF NOT EXISTS energy_consumption_for_qfortyfour_questions (
            ecfqff_id VARCHAR(255) PRIMARY KEY,
            stide_id VARCHAR(255),
            energy_purchased VARCHAR(255),
            energy_type VARCHAR(255),
            quantity NUMERIC(10,2),
            unit VARCHAR(50),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(stide_id) REFERENCES scope_two_indirect_emissions_questions (stide_id)
  );`,
        // Q46
        `CREATE TABLE IF NOT EXISTS cloud_provider_details_questions (
            cpd_id VARCHAR(255) PRIMARY KEY,
            stide_id VARCHAR(255),
            cloud_provider_name VARCHAR(255),
            virtual_machines VARCHAR(255),
            data_storage VARCHAR(255),
            data_transfer VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(stide_id) REFERENCES scope_two_indirect_emissions_questions (stide_id)
  );`,
        // Q47
        `CREATE TABLE IF NOT EXISTS dedicated_monitoring_sensor_usage_questions (
            dmsu_id VARCHAR(255) PRIMARY KEY,
            stide_id VARCHAR(255),
            type_of_sensor VARCHAR(255),
            sensor_quantity VARCHAR(255),
            energy_consumption VARCHAR(255),
            unit VARCHAR(50),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(stide_id) REFERENCES scope_two_indirect_emissions_questions (stide_id)
  );`,
        // Q48
        `CREATE TABLE IF NOT EXISTS annual_replacement_rate_of_sensor_questions (
            arros_id VARCHAR(255) PRIMARY KEY,
            stide_id VARCHAR(255),
            consumable_name VARCHAR(255),
            quantity VARCHAR(255),
            unit VARCHAR(50),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(stide_id) REFERENCES scope_two_indirect_emissions_questions (stide_id)
  );`,
        // Q51
        `CREATE TABLE IF NOT EXISTS energy_consumption_for_qfiftyone_questions (
            ecfqfo_id VARCHAR(255) PRIMARY KEY,
            stide_id VARCHAR(255),
            energy_purchased VARCHAR(255),
            energy_type VARCHAR(255),
            quantity NUMERIC(10,2),
            unit VARCHAR(50),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(stide_id) REFERENCES scope_two_indirect_emissions_questions (stide_id)
  );`,

        //Scope Three Other Indirect Emissions

        // Q52
        `CREATE TABLE IF NOT EXISTS scope_three_other_indirect_emissions_questions (
            stoie_id VARCHAR(255) PRIMARY KEY,
            sgiq_id VARCHAR(255),
            raw_materials_contact_enviguide_support BOOLEAN DEFAULT false,
            grade_of_metal_used VARCHAR(255),
            msds_link_or_upload_document TEXT[], -- array of document links or file references Q54
            use_of_recycled_secondary_materials BOOLEAN DEFAULT false, -- Q55
            percentage_of_pre_post_consumer_material_used_in_product BOOLEAN DEFAULT false, -- Q57
            do_you_use_recycle_mat_for_packaging BOOLEAN DEFAULT false, -- Q63
            percentage_of_recycled_content_used_in_packaging TEXT, -- Q64
            do_you_use_electricity_for_packaging BOOLEAN DEFAULT false, -- Q65
            energy_con_included_total_energy_pur_sec_two_qsixtysix BOOLEAN DEFAULT false, --Q66
            internal_or_external_waste_material_per_recycling TEXT, --Q69
            any_by_product_generated BOOLEAN DEFAULT false, --Q70
            do_you_track_emission_from_transport BOOLEAN DEFAULT false, -- Q72
            mode_of_transport_used_for_transportation BOOLEAN DEFAULT false, -- Q74
            mode_of_transport_enviguide_support BOOLEAN DEFAULT false, -- Q74
            iso_14001_or_iso_50001_certified BOOLEAN DEFAULT false, --Q76
            standards_followed_iso_14067_GHG_catena_etc BOOLEAN DEFAULT false, --Q77
            do_you_report_to_cdp_sbti_or_other BOOLEAN DEFAULT false, --Q78
            measures_to_reduce_carbon_emissions_in_production TEXT, --Q79
            renewable_energy_initiatives_or_recycling_programs TEXT, --Q80
            your_company_info TEXT, --Q81
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(sgiq_id) REFERENCES supplier_general_info_questions (sgiq_id)
  );`,
        // Q52
        `CREATE TABLE IF NOT EXISTS raw_materials_used_in_component_manufacturing_questions (
            rmuicm_id VARCHAR(255) PRIMARY KEY,
            stoie_id VARCHAR(255),
            bom_id VARCHAR(255),  
            product_id VARCHAR(255),
            product_bom_pcf_id VARCHAR(255),
            material_number VARCHAR(255),
            material_name VARCHAR(255),
            percentage VARCHAR(50),
            annual_reporting_period VARCHAR(50),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(stoie_id) REFERENCES scope_three_other_indirect_emissions_questions (stoie_id)
  );`,
        // Q56
        `CREATE TABLE IF NOT EXISTS recycled_materials_with_percentage_questions (
            rmwp_id VARCHAR(255) PRIMARY KEY,
            stoie_id VARCHAR(255),
            bom_id VARCHAR(255),  
            product_id VARCHAR(255),
            product_bom_pcf_id VARCHAR(255),
            material_number VARCHAR(255),
            material_name VARCHAR(255),
            percentage VARCHAR(50),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(stoie_id) REFERENCES scope_three_other_indirect_emissions_questions (stoie_id)
  );`,
        // Q58
        `CREATE TABLE IF NOT EXISTS pre_post_consumer_reutilization_percentage_questions (
            ppcrp_id VARCHAR(255) PRIMARY KEY,
            stoie_id VARCHAR(255),
            material_type VARCHAR(255),
            percentage VARCHAR(50),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(stoie_id) REFERENCES scope_three_other_indirect_emissions_questions (stoie_id)
  );`,

        // Q59
        `CREATE TABLE IF NOT EXISTS pir_pcr_material_percentage_questions (
            ppmp_id VARCHAR(255) PRIMARY KEY,
            stoie_id VARCHAR(255),
            material_type VARCHAR(255),
            percentage VARCHAR(50),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(stoie_id) REFERENCES scope_three_other_indirect_emissions_questions (stoie_id)
  );`,

        // Q60
        `CREATE TABLE IF NOT EXISTS type_of_pack_mat_used_for_delivering_questions (
            topmudp_id VARCHAR(255) PRIMARY KEY,
            stoie_id VARCHAR(255),
            bom_id VARCHAR(255),  
            product_id VARCHAR(255),
            product_bom_pcf_id VARCHAR(255),
            material_number VARCHAR(255),
            component_name VARCHAR(255),
            packagin_type VARCHAR(255),
            treatment_type VARCHAR(255),
            packaging_size VARCHAR(255),
            unit VARCHAR(50),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(stoie_id) REFERENCES scope_three_other_indirect_emissions_questions (stoie_id)
  );`,

        // Q61
        `CREATE TABLE IF NOT EXISTS weight_of_packaging_per_unit_product_questions (
            woppup_id VARCHAR(255) PRIMARY KEY,
            stoie_id VARCHAR(255),
            bom_id VARCHAR(255),  
            product_id VARCHAR(255),
            product_bom_pcf_id VARCHAR(255),
            material_number VARCHAR(255),
            component_name VARCHAR(255),
            packagin_weight VARCHAR(255),
            unit VARCHAR(50),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(stoie_id) REFERENCES scope_three_other_indirect_emissions_questions (stoie_id)
  );`,

        // Q67
        `CREATE TABLE IF NOT EXISTS energy_consumption_for_qsixtyseven_questions (
            ecfqss_id VARCHAR(255) PRIMARY KEY,
            stoie_id VARCHAR(255),
            energy_purchased VARCHAR(255),
            energy_type VARCHAR(255),
            quantity NUMERIC(10,2),
            unit VARCHAR(50),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(stoie_id) REFERENCES scope_three_other_indirect_emissions_questions (stoie_id)
  );`,

        // Q68
        `CREATE TABLE IF NOT EXISTS weight_of_pro_packaging_waste_questions (
            woppw_id VARCHAR(255) PRIMARY KEY,
            stoie_id VARCHAR(255),
            bom_id VARCHAR(255), 
            product_id VARCHAR(255), 
            product_bom_pcf_id VARCHAR(255),
            material_number VARCHAR(255),
            component_name VARCHAR(255),
            waste_type VARCHAR(255),
            waste_weight VARCHAR(255),
            unit VARCHAR(50),
            annual_reporting_period VARCHAR(50),
            treatment_type VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(stoie_id) REFERENCES scope_three_other_indirect_emissions_questions (stoie_id)
  );`,

        // Q71
        `CREATE TABLE IF NOT EXISTS type_of_by_product_questions (
            topbp_id VARCHAR(255) PRIMARY KEY,
            stoie_id VARCHAR(255),
            bom_id VARCHAR(255),  
            product_id VARCHAR(255),
            product_bom_pcf_id VARCHAR(255),
            material_number VARCHAR(255),
            component_name VARCHAR(255),
            by_product VARCHAR(255),
            price_per_product NUMERIC(10,2),
            quantity INTEGER,
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(stoie_id) REFERENCES scope_three_other_indirect_emissions_questions (stoie_id)
  );`,

        // Q73
        `CREATE TABLE IF NOT EXISTS co_two_emission_of_raw_material_questions (
            coteorm_id VARCHAR(255) PRIMARY KEY,
            stoie_id VARCHAR(255),
            bom_id VARCHAR(255),  
            product_id VARCHAR(255),
            product_bom_pcf_id VARCHAR(255),
            material_number VARCHAR(255),
            component_name VARCHAR(255),
            raw_material_name VARCHAR(255),
            transport_mode VARCHAR(255),
            source_location VARCHAR(255),
            source_lat VARCHAR(255),
            source_long VARCHAR(255),
            destination_location VARCHAR(255),
            destination_lat VARCHAR(255),
            destination_long VARCHAR(255),
            co_two_emission VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(stoie_id) REFERENCES scope_three_other_indirect_emissions_questions (stoie_id)
  );`,

        // Q74
        `CREATE TABLE IF NOT EXISTS mode_of_transport_used_for_transportation_questions (
            motuft_id VARCHAR(255) PRIMARY KEY,
            stoie_id VARCHAR(255),
            bom_id VARCHAR(255),
            product_id VARCHAR(255),
            product_bom_pcf_id VARCHAR(255),
            material_number VARCHAR(255),
            component_name VARCHAR(255),
            mode_of_transport VARCHAR(255),
            weight_transported VARCHAR(255),
            source_point VARCHAR(255),
            drop_point VARCHAR(255),
            distance VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(stoie_id) REFERENCES scope_three_other_indirect_emissions_questions (stoie_id)
  );`,

        // Q75
        `CREATE TABLE IF NOT EXISTS destination_plant_component_transportation_questions (
            dpct_id VARCHAR(255) PRIMARY KEY,
            stoie_id VARCHAR(255),
            country VARCHAR(255),
            state VARCHAR(255),
            city VARCHAR(255),
            pincode VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(stoie_id) REFERENCES scope_three_other_indirect_emissions_questions (stoie_id)
  );`,

        //Scope Four Avoided Emissions

        // Q82
        `CREATE TABLE IF NOT EXISTS scope_four_avoided_emissions_questions (
            sfae_id VARCHAR(255) PRIMARY KEY,
            sgiq_id VARCHAR(255),
            products_or_services_that_help_reduce_customer_emissions TEXT, --Q82
            circular_economy_practices_reuse_take_back_epr_refurbishment TEXT, --Q83
            renewable_energy_carbon_offset_projects_implemented TEXT, --Q84
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(sgiq_id) REFERENCES supplier_general_info_questions (sgiq_id)
  );`,

        //  ==========>Supplier Organization Questionnaire Tables end<============


        //===========> DQR Rating Tables total 50 tables

        // Q9
        `CREATE TABLE IF NOT EXISTS dqr_emission_data_rating_qnine (
            edrqn_id VARCHAR(255) PRIMARY KEY,
            sgiq_id VARCHAR(255),
            aosotte_id VARCHAR(255), -- FK to availability_of_scope_one_two_three_emissions
            data TEXT,
            ter_tag_type VARCHAR(255),
            ter_tag_value VARCHAR(255), 
            ter_data_point VARCHAR(255),   
            tir_tag_type VARCHAR(255),
            tir_tag_value VARCHAR(255), 
            tir_data_point VARCHAR(255), 
            gr_tag_type VARCHAR(255),
            gr_tag_value VARCHAR(255), 
            gr_data_point VARCHAR(255),   
            c_tag_type VARCHAR(255),
            c_tag_value VARCHAR(255), 
            c_data_point VARCHAR(255), 
            pds_tag_type VARCHAR(255),
            pds_tag_value VARCHAR(255), 
            pds_data_point VARCHAR(255),
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );`,
        // Q11
        `CREATE TABLE IF NOT EXISTS dqr_supplier_product_questions_rating_qeleven (
            spqrqe_id VARCHAR(255) PRIMARY KEY,
            sgiq_id VARCHAR(255),
            spq_id VARCHAR(255), --foreign key to supplier_product_questions
            data TEXT,
            ter_tag_type VARCHAR(255),
            ter_tag_value VARCHAR(255), 
            ter_data_point VARCHAR(255),   
            tir_tag_type VARCHAR(255),
            tir_tag_value VARCHAR(255), 
            tir_data_point VARCHAR(255), 
            gr_tag_type VARCHAR(255),
            gr_tag_value VARCHAR(255), 
            gr_data_point VARCHAR(255),   
            c_tag_type VARCHAR(255),
            c_tag_value VARCHAR(255), 
            c_data_point VARCHAR(255), 
            pds_tag_type VARCHAR(255),
            pds_tag_value VARCHAR(255), 
            pds_data_point VARCHAR(255),
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );`,
        // Q12
        `CREATE TABLE IF NOT EXISTS dqr_supplier_product_questions_rating_qtwelve (
            spqrqt_id VARCHAR(255) PRIMARY KEY,
            sgiq_id VARCHAR(255),
            spq_id VARCHAR(255), --foreign key to supplier_product_questions
            data TEXT,
            ter_tag_type VARCHAR(255),
            ter_tag_value VARCHAR(255), 
            ter_data_point VARCHAR(255),   
            tir_tag_type VARCHAR(255),
            tir_tag_value VARCHAR(255), 
            tir_data_point VARCHAR(255), 
            gr_tag_type VARCHAR(255),
            gr_tag_value VARCHAR(255), 
            gr_data_point VARCHAR(255),   
            c_tag_type VARCHAR(255),
            c_tag_value VARCHAR(255), 
            c_data_point VARCHAR(255), 
            pds_tag_type VARCHAR(255),
            pds_tag_value VARCHAR(255), 
            pds_data_point VARCHAR(255),
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );`,
        // Q13
        `CREATE TABLE IF NOT EXISTS dqr_production_site_detail_rating_qthirteen (
            psdrqt_id VARCHAR(255) PRIMARY KEY,
            sgiq_id VARCHAR(255),
            psd_id VARCHAR(255), --foreign key to production_site_details
            data TEXT,
            ter_tag_type VARCHAR(255),
            ter_tag_value VARCHAR(255), 
            ter_data_point VARCHAR(255),   
            tir_tag_type VARCHAR(255),
            tir_tag_value VARCHAR(255), 
            tir_data_point VARCHAR(255), 
            gr_tag_type VARCHAR(255),
            gr_tag_value VARCHAR(255), 
            gr_data_point VARCHAR(255),   
            c_tag_type VARCHAR(255),
            c_tag_value VARCHAR(255), 
            c_data_point VARCHAR(255), 
            pds_tag_type VARCHAR(255),
            pds_tag_value VARCHAR(255), 
            pds_data_point VARCHAR(255),
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );`,
        // Q15
        `CREATE TABLE IF NOT EXISTS dqr_product_component_manufactured_rating_qfiften (
            pcmrqf_id VARCHAR(255) PRIMARY KEY,
            sgiq_id VARCHAR(255),
            pcm_id VARCHAR(255), --foreign key to product_component_manufactured
            data TEXT,
            ter_tag_type VARCHAR(255),
            ter_tag_value VARCHAR(255), 
            ter_data_point VARCHAR(255),   
            tir_tag_type VARCHAR(255),
            tir_tag_value VARCHAR(255), 
            tir_data_point VARCHAR(255), 
            gr_tag_type VARCHAR(255),
            gr_tag_value VARCHAR(255), 
            gr_data_point VARCHAR(255),   
            c_tag_type VARCHAR(255),
            c_tag_value VARCHAR(255), 
            c_data_point VARCHAR(255), 
            pds_tag_type VARCHAR(255),
            pds_tag_value VARCHAR(255), 
            pds_data_point VARCHAR(255),
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );`,

        // Q15.1
        `CREATE TABLE IF NOT EXISTS dqr_co_product_component_manufactured_rating_qfiftenone (
            pcmrqfo_id VARCHAR(255) PRIMARY KEY,
            sgiq_id VARCHAR(255),
            cpcev_id VARCHAR(255), --foreign key to co_product_component_economic_value_questions
            data TEXT,
            ter_tag_type VARCHAR(255),
            ter_tag_value VARCHAR(255), 
            ter_data_point VARCHAR(255),   
            tir_tag_type VARCHAR(255),
            tir_tag_value VARCHAR(255), 
            tir_data_point VARCHAR(255), 
            gr_tag_type VARCHAR(255),
            gr_tag_value VARCHAR(255), 
            gr_data_point VARCHAR(255),   
            c_tag_type VARCHAR(255),
            c_tag_value VARCHAR(255), 
            c_data_point VARCHAR(255), 
            pds_tag_type VARCHAR(255),
            pds_tag_value VARCHAR(255), 
            pds_data_point VARCHAR(255),
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );`,

        // Q16
        `CREATE TABLE IF NOT EXISTS dqr_stationary_combustion_on_site_energy_rating_qsixten (
            scoserqs_id VARCHAR(255) PRIMARY KEY,
            sgiq_id VARCHAR(255),
            scoseu_id VARCHAR(255), --foreign key to stationary_combustion_on_site_energy_use
            data TEXT,
            ter_tag_type VARCHAR(255),
            ter_tag_value VARCHAR(255), 
            ter_data_point VARCHAR(255),   
            tir_tag_type VARCHAR(255),
            tir_tag_value VARCHAR(255), 
            tir_data_point VARCHAR(255), 
            gr_tag_type VARCHAR(255),
            gr_tag_value VARCHAR(255), 
            gr_data_point VARCHAR(255),   
            c_tag_type VARCHAR(255),
            c_tag_value VARCHAR(255), 
            c_data_point VARCHAR(255), 
            pds_tag_type VARCHAR(255),
            pds_tag_value VARCHAR(255), 
            pds_data_point VARCHAR(255),
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );`,
        // Q17
        `CREATE TABLE IF NOT EXISTS dqr_mobile_combustion_company_owned_vehicles_rating_qseventen (
            mccoqrqs_id VARCHAR(255) PRIMARY KEY,
            sgiq_id VARCHAR(255),
            mccov_id VARCHAR(255), --foreign key to mobile_combustion_company_owned_vehicles
            data TEXT,
            ter_tag_type VARCHAR(255),
            ter_tag_value VARCHAR(255), 
            ter_data_point VARCHAR(255),   
            tir_tag_type VARCHAR(255),
            tir_tag_value VARCHAR(255), 
            tir_data_point VARCHAR(255), 
            gr_tag_type VARCHAR(255),
            gr_tag_value VARCHAR(255), 
            gr_data_point VARCHAR(255),   
            c_tag_type VARCHAR(255),
            c_tag_value VARCHAR(255), 
            c_data_point VARCHAR(255), 
            pds_tag_type VARCHAR(255),
            pds_tag_value VARCHAR(255), 
            pds_data_point VARCHAR(255),
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );`,
        // Q19
        `CREATE TABLE IF NOT EXISTS dqr_refrigerants_rating_qnineten (
            refrqn_id VARCHAR(255) PRIMARY KEY,
            sgiq_id VARCHAR(255),
            refr_id VARCHAR(255), --foreign key to refrigerants
            data TEXT,
            ter_tag_type VARCHAR(255),
            ter_tag_value VARCHAR(255), 
            ter_data_point VARCHAR(255),   
            tir_tag_type VARCHAR(255),
            tir_tag_value VARCHAR(255), 
            tir_data_point VARCHAR(255), 
            gr_tag_type VARCHAR(255),
            gr_tag_value VARCHAR(255), 
            gr_data_point VARCHAR(255),   
            c_tag_type VARCHAR(255),
            c_tag_value VARCHAR(255), 
            c_data_point VARCHAR(255), 
            pds_tag_type VARCHAR(255),
            pds_tag_value VARCHAR(255), 
            pds_data_point VARCHAR(255),
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );`,
        // Q21
        `CREATE TABLE IF NOT EXISTS dqr_process_emissions_sources_qtwentyone (
            pesqto_id VARCHAR(255) PRIMARY KEY,
            sgiq_id VARCHAR(255),
            pes_id VARCHAR(255), --foreign key to process_emissions_sources
            data TEXT,
            ter_tag_type VARCHAR(255),
            ter_tag_value VARCHAR(255), 
            ter_data_point VARCHAR(255),   
            tir_tag_type VARCHAR(255),
            tir_tag_value VARCHAR(255), 
            tir_data_point VARCHAR(255), 
            gr_tag_type VARCHAR(255),
            gr_tag_value VARCHAR(255), 
            gr_data_point VARCHAR(255),   
            c_tag_type VARCHAR(255),
            c_tag_value VARCHAR(255), 
            c_data_point VARCHAR(255), 
            pds_tag_type VARCHAR(255),
            pds_tag_value VARCHAR(255), 
            pds_data_point VARCHAR(255),
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );`,
        // Q22
        `CREATE TABLE IF NOT EXISTS dqr_scope_two_indirect_emis_from_pur_energy_qtwentytwo (
            stidefpeqtt_id VARCHAR(255) PRIMARY KEY,
            sgiq_id VARCHAR(255),
            stidefpe_id VARCHAR(255), --foreign key to scope_two_indirect_emissions_from_purchased_energy
            data TEXT,
            ter_tag_type VARCHAR(255),
            ter_tag_value VARCHAR(255), 
            ter_data_point VARCHAR(255),   
            tir_tag_type VARCHAR(255),
            tir_tag_value VARCHAR(255), 
            tir_data_point VARCHAR(255), 
            gr_tag_type VARCHAR(255),
            gr_tag_value VARCHAR(255), 
            gr_data_point VARCHAR(255),   
            c_tag_type VARCHAR(255),
            c_tag_value VARCHAR(255), 
            c_data_point VARCHAR(255), 
            pds_tag_type VARCHAR(255),
            pds_tag_value VARCHAR(255), 
            pds_data_point VARCHAR(255),
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );`,
        // Q24
        `CREATE TABLE IF NOT EXISTS dqr_scope_two_indirect_emissions_certificates_qtwentyfour (
            stiecqtf_id VARCHAR(255) PRIMARY KEY,
            sgiq_id VARCHAR(255),
            stidec_id VARCHAR(255), --foreign key to scope_two_indirect_emissions_certificates
            data TEXT,
            ter_tag_type VARCHAR(255),
            ter_tag_value VARCHAR(255), 
            ter_data_point VARCHAR(255),   
            tir_tag_type VARCHAR(255),
            tir_tag_value VARCHAR(255), 
            tir_data_point VARCHAR(255), 
            gr_tag_type VARCHAR(255),
            gr_tag_value VARCHAR(255), 
            gr_data_point VARCHAR(255),   
            c_tag_type VARCHAR(255),
            c_tag_value VARCHAR(255), 
            c_data_point VARCHAR(255), 
            pds_tag_type VARCHAR(255),
            pds_tag_value VARCHAR(255), 
            pds_data_point VARCHAR(255),
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );`,
        // Q26
        `CREATE TABLE IF NOT EXISTS dqr_scope_two_indirect_emissions_qtwentysix (
            stieqts_id VARCHAR(255) PRIMARY KEY,
            sgiq_id VARCHAR(255),
            stide_id VARCHAR(255), --foreign key to scope_two_indirect_emissions
            data TEXT,
            ter_tag_type VARCHAR(255),
            ter_tag_value VARCHAR(255), 
            ter_data_point VARCHAR(255),   
            tir_tag_type VARCHAR(255),
            tir_tag_value VARCHAR(255), 
            tir_data_point VARCHAR(255), 
            gr_tag_type VARCHAR(255),
            gr_tag_value VARCHAR(255), 
            gr_data_point VARCHAR(255),   
            c_tag_type VARCHAR(255),
            c_tag_value VARCHAR(255), 
            c_data_point VARCHAR(255), 
            pds_tag_type VARCHAR(255),
            pds_tag_value VARCHAR(255), 
            pds_data_point VARCHAR(255),
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );`,
        // Q27
        `CREATE TABLE IF NOT EXISTS dqr_energy_intensity_of_pro_est_kwhor_mj_qtwentyseven (
            eiopekmqts_id VARCHAR(255) PRIMARY KEY,
            sgiq_id VARCHAR(255),
            eiopekm_id VARCHAR(255), --foreign key to energy_intensity_of_production_estimated_kwhor_mj
            data TEXT,
            ter_tag_type VARCHAR(255),
            ter_tag_value VARCHAR(255), 
            ter_data_point VARCHAR(255),   
            tir_tag_type VARCHAR(255),
            tir_tag_value VARCHAR(255), 
            tir_data_point VARCHAR(255), 
            gr_tag_type VARCHAR(255),
            gr_tag_value VARCHAR(255), 
            gr_data_point VARCHAR(255),   
            c_tag_type VARCHAR(255),
            c_tag_value VARCHAR(255), 
            c_data_point VARCHAR(255), 
            pds_tag_type VARCHAR(255),
            pds_tag_value VARCHAR(255), 
            pds_data_point VARCHAR(255),
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );`,
        // Q28
        `CREATE TABLE IF NOT EXISTS dqr_process_specific_energy_usage_qtwentyeight (
            pseuqte_id VARCHAR(255) PRIMARY KEY,
            sgiq_id VARCHAR(255),
            pseu_id VARCHAR(255), --foreign key to process_specific_energy_usage
            data TEXT,
            ter_tag_type VARCHAR(255),
            ter_tag_value VARCHAR(255), 
            ter_data_point VARCHAR(255),   
            tir_tag_type VARCHAR(255),
            tir_tag_value VARCHAR(255), 
            tir_data_point VARCHAR(255), 
            gr_tag_type VARCHAR(255),
            gr_tag_value VARCHAR(255), 
            gr_data_point VARCHAR(255),   
            c_tag_type VARCHAR(255),
            c_tag_value VARCHAR(255), 
            c_data_point VARCHAR(255), 
            pds_tag_type VARCHAR(255),
            pds_tag_value VARCHAR(255), 
            pds_data_point VARCHAR(255),
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );`,
        // Q30
        `CREATE TABLE IF NOT EXISTS dqr_abatement_systems_used_qthirty (
            asuqt_id VARCHAR(255) PRIMARY KEY,
            sgiq_id VARCHAR(255),
            asu_id VARCHAR(255), --foreign key to abatement_systems_used
            data TEXT,
            ter_tag_type VARCHAR(255),
            ter_tag_value VARCHAR(255), 
            ter_data_point VARCHAR(255),   
            tir_tag_type VARCHAR(255),
            tir_tag_value VARCHAR(255), 
            tir_data_point VARCHAR(255), 
            gr_tag_type VARCHAR(255),
            gr_tag_value VARCHAR(255), 
            gr_data_point VARCHAR(255),   
            c_tag_type VARCHAR(255),
            c_tag_value VARCHAR(255), 
            c_data_point VARCHAR(255), 
            pds_tag_type VARCHAR(255),
            pds_tag_value VARCHAR(255), 
            pds_data_point VARCHAR(255),
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );`,
        // Q31
        `CREATE TABLE IF NOT EXISTS dqr_scope_two_indirect_emissions_qthirtyone (
            stideqto_id VARCHAR(255) PRIMARY KEY,
            sgiq_id VARCHAR(255),
            stide_id VARCHAR(255), --foreign key to scope_two_indirect_emissions
            data TEXT,
            ter_tag_type VARCHAR(255),
            ter_tag_value VARCHAR(255), 
            ter_data_point VARCHAR(255),   
            tir_tag_type VARCHAR(255),
            tir_tag_value VARCHAR(255), 
            tir_data_point VARCHAR(255), 
            gr_tag_type VARCHAR(255),
            gr_tag_value VARCHAR(255), 
            gr_data_point VARCHAR(255),   
            c_tag_type VARCHAR(255),
            c_tag_value VARCHAR(255), 
            c_data_point VARCHAR(255), 
            pds_tag_type VARCHAR(255),
            pds_tag_value VARCHAR(255), 
            pds_data_point VARCHAR(255),
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );`,
        // Q32
        `CREATE TABLE IF NOT EXISTS dqr_type_of_quality_control_equipment_usage_qthirtytwo (
            toqceuqto_id VARCHAR(255) PRIMARY KEY,
            sgiq_id VARCHAR(255),
            toqceu_id VARCHAR(255), --foreign key to type_of_quality_control_equipment_usage
            data TEXT, 
            ter_tag_type VARCHAR(255),
            ter_tag_value VARCHAR(255), 
            ter_data_point VARCHAR(255),   
            tir_tag_type VARCHAR(255),
            tir_tag_value VARCHAR(255), 
            tir_data_point VARCHAR(255), 
            gr_tag_type VARCHAR(255),
            gr_tag_value VARCHAR(255), 
            gr_data_point VARCHAR(255),   
            c_tag_type VARCHAR(255),
            c_tag_value VARCHAR(255), 
            c_data_point VARCHAR(255), 
            pds_tag_type VARCHAR(255),
            pds_tag_value VARCHAR(255), 
            pds_data_point VARCHAR(255),
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );`,
        // Q33
        `CREATE TABLE IF NOT EXISTS dqr_electricity_consumed_for_quality_control_qthirtythree (
            ecfqcqtt_id VARCHAR(255) PRIMARY KEY,
            sgiq_id VARCHAR(255),
            ecfqc_id VARCHAR(255), --foreign key to electricity_consumed_for_quality_control
            data TEXT, 
            ter_tag_type VARCHAR(255),
            ter_tag_value VARCHAR(255), 
            ter_data_point VARCHAR(255),   
            tir_tag_type VARCHAR(255),
            tir_tag_value VARCHAR(255), 
            tir_data_point VARCHAR(255), 
            gr_tag_type VARCHAR(255),
            gr_tag_value VARCHAR(255), 
            gr_data_point VARCHAR(255),   
            c_tag_type VARCHAR(255),
            c_tag_value VARCHAR(255), 
            c_data_point VARCHAR(255), 
            pds_tag_type VARCHAR(255),
            pds_tag_value VARCHAR(255), 
            pds_data_point VARCHAR(255),
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );`,
        // Q34
        `CREATE TABLE IF NOT EXISTS dqr_quality_control_process_usage_qthirtyfour (
            qcpuqtf_id VARCHAR(255) PRIMARY KEY,
            sgiq_id VARCHAR(255),
            qcpu_id VARCHAR(255), --foreign key to quality_control_process_usage
            data TEXT, 
            ter_tag_type VARCHAR(255),
            ter_tag_value VARCHAR(255), 
            ter_data_point VARCHAR(255),   
            tir_tag_type VARCHAR(255),
            tir_tag_value VARCHAR(255), 
            tir_data_point VARCHAR(255), 
            gr_tag_type VARCHAR(255),
            gr_tag_value VARCHAR(255), 
            gr_data_point VARCHAR(255),   
            c_tag_type VARCHAR(255),
            c_tag_value VARCHAR(255), 
            c_data_point VARCHAR(255), 
            pds_tag_type VARCHAR(255),
            pds_tag_value VARCHAR(255), 
            pds_data_point VARCHAR(255),
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );`,
        // Q34
        `CREATE TABLE IF NOT EXISTS dqr_quality_control_process_usage_pressure_or_flow_qthirtyfour (
            qcpupfqtf_id VARCHAR(255) PRIMARY KEY,
            sgiq_id VARCHAR(255),
            qcpupf_id VARCHAR(255), --foreign key to quality_control_process_usage_pressure_or_flow
            data TEXT, 
            ter_tag_type VARCHAR(255),
            ter_tag_value VARCHAR(255), 
            ter_data_point VARCHAR(255),   
            tir_tag_type VARCHAR(255),
            tir_tag_value VARCHAR(255), 
            tir_data_point VARCHAR(255), 
            gr_tag_type VARCHAR(255),
            gr_tag_value VARCHAR(255), 
            gr_data_point VARCHAR(255),   
            c_tag_type VARCHAR(255),
            c_tag_value VARCHAR(255), 
            c_data_point VARCHAR(255), 
            pds_tag_type VARCHAR(255),
            pds_tag_value VARCHAR(255), 
            pds_data_point VARCHAR(255),
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );`,
        // Q35
        `CREATE TABLE IF NOT EXISTS dqr_quality_control_use_any_consumables_qthirtyfive (
            qcuacqtf_id VARCHAR(255) PRIMARY KEY,
            sgiq_id VARCHAR(255),
            qcuac_id VARCHAR(255), --foreign key to quality_control_use_any_consumables
            data TEXT, 
            ter_tag_type VARCHAR(255),
            ter_tag_value VARCHAR(255), 
            ter_data_point VARCHAR(255),   
            tir_tag_type VARCHAR(255),
            tir_tag_value VARCHAR(255), 
            tir_data_point VARCHAR(255), 
            gr_tag_type VARCHAR(255),
            gr_tag_value VARCHAR(255), 
            gr_data_point VARCHAR(255),   
            c_tag_type VARCHAR(255),
            c_tag_value VARCHAR(255), 
            c_data_point VARCHAR(255), 
            pds_tag_type VARCHAR(255),
            pds_tag_value VARCHAR(255), 
            pds_data_point VARCHAR(255),
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );`,
        // Q37
        `CREATE TABLE IF NOT EXISTS dqr_weight_of_samples_destroyed_qthirtyseven (
            wosdqts_id VARCHAR(255) PRIMARY KEY,
            sgiq_id VARCHAR(255),
            wosd_id VARCHAR(255), --foreign key to weight_of_samples_destroyed
            data TEXT, 
            ter_tag_type VARCHAR(255),
            ter_tag_value VARCHAR(255), 
            ter_data_point VARCHAR(255),   
            tir_tag_type VARCHAR(255),
            tir_tag_value VARCHAR(255), 
            tir_data_point VARCHAR(255), 
            gr_tag_type VARCHAR(255),
            gr_tag_value VARCHAR(255), 
            gr_data_point VARCHAR(255),   
            c_tag_type VARCHAR(255),
            c_tag_value VARCHAR(255), 
            c_data_point VARCHAR(255), 
            pds_tag_type VARCHAR(255),
            pds_tag_value VARCHAR(255), 
            pds_data_point VARCHAR(255),
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );`,
        // Q38
        `CREATE TABLE IF NOT EXISTS dqr_defect_or_rej_rate_identified_by_quality_control_qthirtyeight (
           dorriqcqte_id VARCHAR(255) PRIMARY KEY,
            sgiq_id VARCHAR(255),
            dorriqc_id VARCHAR(255), --foreign key to defect_or_rejection_rate_identified_by_quality_control
            data TEXT, 
            ter_tag_type VARCHAR(255),
            ter_tag_value VARCHAR(255), 
            ter_data_point VARCHAR(255),   
            tir_tag_type VARCHAR(255),
            tir_tag_value VARCHAR(255), 
            tir_data_point VARCHAR(255), 
            gr_tag_type VARCHAR(255),
            gr_tag_value VARCHAR(255), 
            gr_data_point VARCHAR(255),   
            c_tag_type VARCHAR(255),
            c_tag_value VARCHAR(255), 
            c_data_point VARCHAR(255), 
            pds_tag_type VARCHAR(255),
            pds_tag_value VARCHAR(255), 
            pds_data_point VARCHAR(255),
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );`,
        // Q39
        `CREATE TABLE IF NOT EXISTS dqr_rework_rate_due_to_quality_control_qthirtynine (
            rrdqcqtn_id VARCHAR(255) PRIMARY KEY,
            sgiq_id VARCHAR(255),
            rrdqc_id VARCHAR(255), --foreign key to rework_rate_due_to_quality_control
            data TEXT, 
            ter_tag_type VARCHAR(255),
            ter_tag_value VARCHAR(255), 
            ter_data_point VARCHAR(255),   
            tir_tag_type VARCHAR(255),
            tir_tag_value VARCHAR(255), 
            tir_data_point VARCHAR(255), 
            gr_tag_type VARCHAR(255),
            gr_tag_value VARCHAR(255), 
            gr_data_point VARCHAR(255),   
            c_tag_type VARCHAR(255),
            c_tag_value VARCHAR(255), 
            c_data_point VARCHAR(255), 
            pds_tag_type VARCHAR(255),
            pds_tag_value VARCHAR(255), 
            pds_data_point VARCHAR(255),
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );`,
        // Q40
        `CREATE TABLE IF NOT EXISTS dqr_weight_of_quality_control_waste_generated_qforty (
            woqcwgqf_id VARCHAR(255) PRIMARY KEY,
            sgiq_id VARCHAR(255),
            woqcwg_id VARCHAR(255), --foreign key to weight_of_quality_control_waste_generated
            data TEXT, 
            ter_tag_type VARCHAR(255),
            ter_tag_value VARCHAR(255), 
            ter_data_point VARCHAR(255),   
            tir_tag_type VARCHAR(255),
            tir_tag_value VARCHAR(255), 
            tir_data_point VARCHAR(255), 
            gr_tag_type VARCHAR(255),
            gr_tag_value VARCHAR(255), 
            gr_data_point VARCHAR(255),   
            c_tag_type VARCHAR(255),
            c_tag_value VARCHAR(255), 
            c_data_point VARCHAR(255), 
            pds_tag_type VARCHAR(255),
            pds_tag_value VARCHAR(255), 
            pds_data_point VARCHAR(255),
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );`,
        // Q41
        `CREATE TABLE IF NOT EXISTS dqr_scope_two_indirect_emissions_qfortyone (
            stideqfo_id VARCHAR(255) PRIMARY KEY,
            sgiq_id VARCHAR(255),
            stide_id VARCHAR(255), --foreign key to scope_two_indirect_emissions
            data TEXT, 
            ter_tag_type VARCHAR(255),
            ter_tag_value VARCHAR(255), 
            ter_data_point VARCHAR(255),   
            tir_tag_type VARCHAR(255),
            tir_tag_value VARCHAR(255), 
            tir_data_point VARCHAR(255), 
            gr_tag_type VARCHAR(255),
            gr_tag_value VARCHAR(255), 
            gr_data_point VARCHAR(255),   
            c_tag_type VARCHAR(255),
            c_tag_value VARCHAR(255), 
            c_data_point VARCHAR(255), 
            pds_tag_type VARCHAR(255),
            pds_tag_value VARCHAR(255), 
            pds_data_point VARCHAR(255),
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );`,
        // Q44
        `CREATE TABLE IF NOT EXISTS dqr_energy_consumption_for_qfortyfour_qfortyfour (
            ecfqffqff_id VARCHAR(255) PRIMARY KEY,
            sgiq_id VARCHAR(255),
            ecfqff_id VARCHAR(255), --foreign key to energy_consumption_for_qfortyfour
            data TEXT, 
            ter_tag_type VARCHAR(255),
            ter_tag_value VARCHAR(255), 
            ter_data_point VARCHAR(255),   
            tir_tag_type VARCHAR(255),
            tir_tag_value VARCHAR(255), 
            tir_data_point VARCHAR(255), 
            gr_tag_type VARCHAR(255),
            gr_tag_value VARCHAR(255), 
            gr_data_point VARCHAR(255),   
            c_tag_type VARCHAR(255),
            c_tag_value VARCHAR(255), 
            c_data_point VARCHAR(255), 
            pds_tag_type VARCHAR(255),
            pds_tag_value VARCHAR(255), 
            pds_data_point VARCHAR(255),
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );`,
        // Q46
        `CREATE TABLE IF NOT EXISTS dqr_cloud_provider_details_qfortysix (
            cpdqfs_id VARCHAR(255) PRIMARY KEY,
            sgiq_id VARCHAR(255),
            cpd_id VARCHAR(255), --foreign key to cloud_provider_details
            data TEXT, 
            ter_tag_type VARCHAR(255),
            ter_tag_value VARCHAR(255), 
            ter_data_point VARCHAR(255),   
            tir_tag_type VARCHAR(255),
            tir_tag_value VARCHAR(255), 
            tir_data_point VARCHAR(255), 
            gr_tag_type VARCHAR(255),
            gr_tag_value VARCHAR(255), 
            gr_data_point VARCHAR(255),   
            c_tag_type VARCHAR(255),
            c_tag_value VARCHAR(255), 
            c_data_point VARCHAR(255), 
            pds_tag_type VARCHAR(255),
            pds_tag_value VARCHAR(255), 
            pds_data_point VARCHAR(255),
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );`,
        // Q47
        `CREATE TABLE IF NOT EXISTS dqr_dedicated_monitoring_sensor_usage_qfortyseven (
            dmsuqfs_id VARCHAR(255) PRIMARY KEY,
            sgiq_id VARCHAR(255),
            dmsu_id VARCHAR(255), --foreign key to dedicated_monitoring_sensor_usage
            data TEXT, 
            ter_tag_type VARCHAR(255),
            ter_tag_value VARCHAR(255), 
            ter_data_point VARCHAR(255),   
            tir_tag_type VARCHAR(255),
            tir_tag_value VARCHAR(255), 
            tir_data_point VARCHAR(255), 
            gr_tag_type VARCHAR(255),
            gr_tag_value VARCHAR(255), 
            gr_data_point VARCHAR(255),   
            c_tag_type VARCHAR(255),
            c_tag_value VARCHAR(255), 
            c_data_point VARCHAR(255), 
            pds_tag_type VARCHAR(255),
            pds_tag_value VARCHAR(255), 
            pds_data_point VARCHAR(255),
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );`,
        // Q48
        `CREATE TABLE IF NOT EXISTS dqr_annual_replacement_rate_of_sensor_qfortyeight (
            arrosqfe_id VARCHAR(255) PRIMARY KEY,
            sgiq_id VARCHAR(255),
            arros_id VARCHAR(255), --foreign key to annual_replacement_rate_of_sensor
            data TEXT, 
            ter_tag_type VARCHAR(255),
            ter_tag_value VARCHAR(255), 
            ter_data_point VARCHAR(255),   
            tir_tag_type VARCHAR(255),
            tir_tag_value VARCHAR(255), 
            tir_data_point VARCHAR(255), 
            gr_tag_type VARCHAR(255),
            gr_tag_value VARCHAR(255), 
            gr_data_point VARCHAR(255),   
            c_tag_type VARCHAR(255),
            c_tag_value VARCHAR(255), 
            c_data_point VARCHAR(255), 
            pds_tag_type VARCHAR(255),
            pds_tag_value VARCHAR(255), 
            pds_data_point VARCHAR(255),
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );`,
        // Q51
        `CREATE TABLE IF NOT EXISTS dqr_energy_consumption_for_qfiftyone_qfiftyone (
            ecfqfoqfo_id VARCHAR(255) PRIMARY KEY,
            sgiq_id VARCHAR(255),
            ecfqfo_id VARCHAR(255), --foreign key to energy_consumption_for_qfiftyone
            data TEXT, 
            ter_tag_type VARCHAR(255),
            ter_tag_value VARCHAR(255), 
            ter_data_point VARCHAR(255),   
            tir_tag_type VARCHAR(255),
            tir_tag_value VARCHAR(255), 
            tir_data_point VARCHAR(255), 
            gr_tag_type VARCHAR(255),
            gr_tag_value VARCHAR(255), 
            gr_data_point VARCHAR(255),   
            c_tag_type VARCHAR(255),
            c_tag_value VARCHAR(255), 
            c_data_point VARCHAR(255), 
            pds_tag_type VARCHAR(255),
            pds_tag_value VARCHAR(255), 
            pds_data_point VARCHAR(255),
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );`,
        // Q52
        `CREATE TABLE IF NOT EXISTS dqr_raw_materials_used_in_component_manufacturing_qfiftytwo (
            rmuicmqft_id VARCHAR(255) PRIMARY KEY,
            sgiq_id VARCHAR(255),
            rmuicm_id VARCHAR(255), --foreign key to raw_materials_used_in_component_manufacturing
            data TEXT, 
            ter_tag_type VARCHAR(255),
            ter_tag_value VARCHAR(255), 
            ter_data_point VARCHAR(255),   
            tir_tag_type VARCHAR(255),
            tir_tag_value VARCHAR(255), 
            tir_data_point VARCHAR(255), 
            gr_tag_type VARCHAR(255),
            gr_tag_value VARCHAR(255), 
            gr_data_point VARCHAR(255),   
            c_tag_type VARCHAR(255),
            c_tag_value VARCHAR(255), 
            c_data_point VARCHAR(255), 
            pds_tag_type VARCHAR(255),
            pds_tag_value VARCHAR(255), 
            pds_data_point VARCHAR(255),
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );`,
        // Q53
        `CREATE TABLE IF NOT EXISTS dqr_scope_three_other_indirect_emissions_qfiftythree (
            stoieqft_id VARCHAR(255) PRIMARY KEY,
            sgiq_id VARCHAR(255),
            stoie_id VARCHAR(255), --foreign key to scope_three_other_indirect_emissions
            data TEXT, 
            ter_tag_type VARCHAR(255),
            ter_tag_value VARCHAR(255), 
            ter_data_point VARCHAR(255),   
            tir_tag_type VARCHAR(255),
            tir_tag_value VARCHAR(255), 
            tir_data_point VARCHAR(255), 
            gr_tag_type VARCHAR(255),
            gr_tag_value VARCHAR(255), 
            gr_data_point VARCHAR(255),   
            c_tag_type VARCHAR(255),
            c_tag_value VARCHAR(255), 
            c_data_point VARCHAR(255), 
            pds_tag_type VARCHAR(255),
            pds_tag_value VARCHAR(255), 
            pds_data_point VARCHAR(255),
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );`,
        // Q54
        `CREATE TABLE IF NOT EXISTS dqr_scope_three_other_indirect_emissions_qfiftyfour (
            stoieqff_id VARCHAR(255) PRIMARY KEY,
            sgiq_id VARCHAR(255),
            stoie_id VARCHAR(255), --foreign key to scope_three_other_indirect_emissions
            data TEXT, 
            ter_tag_type VARCHAR(255),
            ter_tag_value VARCHAR(255), 
            ter_data_point VARCHAR(255),   
            tir_tag_type VARCHAR(255),
            tir_tag_value VARCHAR(255), 
            tir_data_point VARCHAR(255), 
            gr_tag_type VARCHAR(255),
            gr_tag_value VARCHAR(255), 
            gr_data_point VARCHAR(255),   
            c_tag_type VARCHAR(255),
            c_tag_value VARCHAR(255), 
            c_data_point VARCHAR(255), 
            pds_tag_type VARCHAR(255),
            pds_tag_value VARCHAR(255), 
            pds_data_point VARCHAR(255),
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );`,
        // Q56
        `CREATE TABLE IF NOT EXISTS dqr_recycled_materials_with_percentage_qfiftysix (
            rmwpqfs_id VARCHAR(255) PRIMARY KEY,
            sgiq_id VARCHAR(255),
            rmwp_id VARCHAR(255), --foreign key to recycled_materials_with_percentage
            data TEXT, 
            ter_tag_type VARCHAR(255),
            ter_tag_value VARCHAR(255), 
            ter_data_point VARCHAR(255),   
            tir_tag_type VARCHAR(255),
            tir_tag_value VARCHAR(255), 
            tir_data_point VARCHAR(255), 
            gr_tag_type VARCHAR(255),
            gr_tag_value VARCHAR(255), 
            gr_data_point VARCHAR(255),   
            c_tag_type VARCHAR(255),
            c_tag_value VARCHAR(255), 
            c_data_point VARCHAR(255), 
            pds_tag_type VARCHAR(255),
            pds_tag_value VARCHAR(255), 
            pds_data_point VARCHAR(255),
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );`,
        // Q58
        `CREATE TABLE IF NOT EXISTS dqr_pre_post_consumer_reutilization_percentage_qfiftyeight (
            ppcrpqfe_id VARCHAR(255) PRIMARY KEY,
            sgiq_id VARCHAR(255),
            ppcrp_id VARCHAR(255), --foreign key to pre_post_consumer_reutilization_percentage
            data TEXT, 
            ter_tag_type VARCHAR(255),
            ter_tag_value VARCHAR(255), 
            ter_data_point VARCHAR(255),   
            tir_tag_type VARCHAR(255),
            tir_tag_value VARCHAR(255), 
            tir_data_point VARCHAR(255), 
            gr_tag_type VARCHAR(255),
            gr_tag_value VARCHAR(255), 
            gr_data_point VARCHAR(255),   
            c_tag_type VARCHAR(255),
            c_tag_value VARCHAR(255), 
            c_data_point VARCHAR(255), 
            pds_tag_type VARCHAR(255),
            pds_tag_value VARCHAR(255), 
            pds_data_point VARCHAR(255),
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );`,
        // Q59
        `CREATE TABLE IF NOT EXISTS dqr_pir_pcr_material_percentage_qfiftynine (
            ppmpqfn_id VARCHAR(255) PRIMARY KEY,
            sgiq_id VARCHAR(255),
            ppmp_id VARCHAR(255), --foreign key to pir_pcr_material_percentage
            data TEXT, 
            ter_tag_type VARCHAR(255),
            ter_tag_value VARCHAR(255), 
            ter_data_point VARCHAR(255),   
            tir_tag_type VARCHAR(255),
            tir_tag_value VARCHAR(255), 
            tir_data_point VARCHAR(255), 
            gr_tag_type VARCHAR(255),
            gr_tag_value VARCHAR(255), 
            gr_data_point VARCHAR(255),   
            c_tag_type VARCHAR(255),
            c_tag_value VARCHAR(255), 
            c_data_point VARCHAR(255), 
            pds_tag_type VARCHAR(255),
            pds_tag_value VARCHAR(255), 
            pds_data_point VARCHAR(255),
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );`,
        // Q60
        `CREATE TABLE IF NOT EXISTS dqr_type_of_pack_mat_used_for_delivering_qsixty (
            topmudpqs_id VARCHAR(255) PRIMARY KEY,
            sgiq_id VARCHAR(255),
            topmudp_id VARCHAR(255), --foreign key to type_of_pack_mat_used_for_delivering
            data TEXT, 
            ter_tag_type VARCHAR(255),
            ter_tag_value VARCHAR(255), 
            ter_data_point VARCHAR(255),   
            tir_tag_type VARCHAR(255),
            tir_tag_value VARCHAR(255), 
            tir_data_point VARCHAR(255), 
            gr_tag_type VARCHAR(255),
            gr_tag_value VARCHAR(255), 
            gr_data_point VARCHAR(255),   
            c_tag_type VARCHAR(255),
            c_tag_value VARCHAR(255), 
            c_data_point VARCHAR(255), 
            pds_tag_type VARCHAR(255),
            pds_tag_value VARCHAR(255), 
            pds_data_point VARCHAR(255),
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );`,
        // Q61
        `CREATE TABLE IF NOT EXISTS dqr_weight_of_packaging_per_unit_product_qsixtyone (
            woppupqso_id VARCHAR(255) PRIMARY KEY,
            sgiq_id VARCHAR(255),
            woppup_id VARCHAR(255), --foreign key to weight_of_packaging_per_unit_product
            data TEXT, 
            ter_tag_type VARCHAR(255),
            ter_tag_value VARCHAR(255), 
            ter_data_point VARCHAR(255),   
            tir_tag_type VARCHAR(255),
            tir_tag_value VARCHAR(255), 
            tir_data_point VARCHAR(255), 
            gr_tag_type VARCHAR(255),
            gr_tag_value VARCHAR(255), 
            gr_data_point VARCHAR(255),   
            c_tag_type VARCHAR(255),
            c_tag_value VARCHAR(255), 
            c_data_point VARCHAR(255), 
            pds_tag_type VARCHAR(255),
            pds_tag_value VARCHAR(255), 
            pds_data_point VARCHAR(255),
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );`,
        // Q64
        `CREATE TABLE IF NOT EXISTS dqr_scope_three_other_indirect_emissions_qsixtyfour (
            stoieqsf_id VARCHAR(255) PRIMARY KEY,
            sgiq_id VARCHAR(255),
            stoie_id VARCHAR(255), --foreign key to scope_three_other_indirect_emissions
            data TEXT, 
            ter_tag_type VARCHAR(255),
            ter_tag_value VARCHAR(255), 
            ter_data_point VARCHAR(255),   
            tir_tag_type VARCHAR(255),
            tir_tag_value VARCHAR(255), 
            tir_data_point VARCHAR(255), 
            gr_tag_type VARCHAR(255),
            gr_tag_value VARCHAR(255), 
            gr_data_point VARCHAR(255),   
            c_tag_type VARCHAR(255),
            c_tag_value VARCHAR(255), 
            c_data_point VARCHAR(255), 
            pds_tag_type VARCHAR(255),
            pds_tag_value VARCHAR(255), 
            pds_data_point VARCHAR(255),
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );`,
        // Q67
        `CREATE TABLE IF NOT EXISTS dqr_energy_consumption_for_qsixtyseven_qsixtyseven (
            ecfqssqss_id VARCHAR(255) PRIMARY KEY,
            sgiq_id VARCHAR(255),
            ecfqss_id VARCHAR(255), --foreign key to energy_consumption_for_qsixtyseven
            data TEXT, 
            ter_tag_type VARCHAR(255),
            ter_tag_value VARCHAR(255), 
            ter_data_point VARCHAR(255),   
            tir_tag_type VARCHAR(255),
            tir_tag_value VARCHAR(255), 
            tir_data_point VARCHAR(255), 
            gr_tag_type VARCHAR(255),
            gr_tag_value VARCHAR(255), 
            gr_data_point VARCHAR(255),   
            c_tag_type VARCHAR(255),
            c_tag_value VARCHAR(255), 
            c_data_point VARCHAR(255), 
            pds_tag_type VARCHAR(255),
            pds_tag_value VARCHAR(255), 
            pds_data_point VARCHAR(255),
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );`,
        // Q68
        `CREATE TABLE IF NOT EXISTS dqr_weight_of_pro_packaging_waste_qsixtyeight (
            woppwqse_id VARCHAR(255) PRIMARY KEY,
            sgiq_id VARCHAR(255),
            woppw_id VARCHAR(255), --foreign key to weight_of_pro_packaging_waste
            data TEXT, 
            ter_tag_type VARCHAR(255),
            ter_tag_value VARCHAR(255), 
            ter_data_point VARCHAR(255),   
            tir_tag_type VARCHAR(255),
            tir_tag_value VARCHAR(255), 
            tir_data_point VARCHAR(255), 
            gr_tag_type VARCHAR(255),
            gr_tag_value VARCHAR(255), 
            gr_data_point VARCHAR(255),   
            c_tag_type VARCHAR(255),
            c_tag_value VARCHAR(255), 
            c_data_point VARCHAR(255), 
            pds_tag_type VARCHAR(255),
            pds_tag_value VARCHAR(255), 
            pds_data_point VARCHAR(255),
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );`,
        // Q69
        `CREATE TABLE IF NOT EXISTS dqr_scope_three_other_indirect_emissions_qsixtynine (
            stoieqsn_id VARCHAR(255) PRIMARY KEY,
            sgiq_id VARCHAR(255),
            stoie_id VARCHAR(255), --foreign key to scope_three_other_indirect_emissions
            data TEXT, 
            ter_tag_type VARCHAR(255),
            ter_tag_value VARCHAR(255), 
            ter_data_point VARCHAR(255),   
            tir_tag_type VARCHAR(255),
            tir_tag_value VARCHAR(255), 
            tir_data_point VARCHAR(255), 
            gr_tag_type VARCHAR(255),
            gr_tag_value VARCHAR(255), 
            gr_data_point VARCHAR(255),   
            c_tag_type VARCHAR(255),
            c_tag_value VARCHAR(255), 
            c_data_point VARCHAR(255), 
            pds_tag_type VARCHAR(255),
            pds_tag_value VARCHAR(255), 
            pds_data_point VARCHAR(255),
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );`,
        // Q71
        `CREATE TABLE IF NOT EXISTS dqr_type_of_by_product_qseventyone (
            topbpqso_id VARCHAR(255) PRIMARY KEY,
            sgiq_id VARCHAR(255),
            topbp_id VARCHAR(255), --foreign key to type_of_by_product
            data TEXT, 
            ter_tag_type VARCHAR(255),
            ter_tag_value VARCHAR(255), 
            ter_data_point VARCHAR(255),   
            tir_tag_type VARCHAR(255),
            tir_tag_value VARCHAR(255), 
            tir_data_point VARCHAR(255), 
            gr_tag_type VARCHAR(255),
            gr_tag_value VARCHAR(255), 
            gr_data_point VARCHAR(255),   
            c_tag_type VARCHAR(255),
            c_tag_value VARCHAR(255), 
            c_data_point VARCHAR(255), 
            pds_tag_type VARCHAR(255),
            pds_tag_value VARCHAR(255), 
            pds_data_point VARCHAR(255),
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );`,
        // Q73
        `CREATE TABLE IF NOT EXISTS dqr_co_two_emission_of_raw_material_qseventythree (
            coteormqst_id VARCHAR(255) PRIMARY KEY,
            sgiq_id VARCHAR(255),
            coteorm_id VARCHAR(255), --foreign key to co_two_emission_of_raw_material
            data TEXT, 
            ter_tag_type VARCHAR(255),
            ter_tag_value VARCHAR(255), 
            ter_data_point VARCHAR(255),   
            tir_tag_type VARCHAR(255),
            tir_tag_value VARCHAR(255), 
            tir_data_point VARCHAR(255), 
            gr_tag_type VARCHAR(255),
            gr_tag_value VARCHAR(255), 
            gr_data_point VARCHAR(255),   
            c_tag_type VARCHAR(255),
            c_tag_value VARCHAR(255), 
            c_data_point VARCHAR(255), 
            pds_tag_type VARCHAR(255),
            pds_tag_value VARCHAR(255), 
            pds_data_point VARCHAR(255),
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );`,
        // Q74
        `CREATE TABLE IF NOT EXISTS dqr_mode_of_transport_used_for_transportation_qseventyfour (
            motuftqsf_id VARCHAR(255) PRIMARY KEY,
            sgiq_id VARCHAR(255),
            motuft_id VARCHAR(255), --foreign key to mode_of_transport_used_for_transportation
            data TEXT, 
            ter_tag_type VARCHAR(255),
            ter_tag_value VARCHAR(255), 
            ter_data_point VARCHAR(255),   
            tir_tag_type VARCHAR(255),
            tir_tag_value VARCHAR(255), 
            tir_data_point VARCHAR(255), 
            gr_tag_type VARCHAR(255),
            gr_tag_value VARCHAR(255), 
            gr_data_point VARCHAR(255),   
            c_tag_type VARCHAR(255),
            c_tag_value VARCHAR(255), 
            c_data_point VARCHAR(255), 
            pds_tag_type VARCHAR(255),
            pds_tag_value VARCHAR(255), 
            pds_data_point VARCHAR(255),
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );`,
        // Q75
        `CREATE TABLE IF NOT EXISTS dqr_destination_plant_component_transportation_qseventyfive (
            dpctqsf_id VARCHAR(255) PRIMARY KEY,
            sgiq_id VARCHAR(255),
            dpct_id VARCHAR(255), --foreign key to destination_plant_component_transportation
            data TEXT, 
            ter_tag_type VARCHAR(255),
            ter_tag_value VARCHAR(255), 
            ter_data_point VARCHAR(255),   
            tir_tag_type VARCHAR(255),
            tir_tag_value VARCHAR(255), 
            tir_data_point VARCHAR(255), 
            gr_tag_type VARCHAR(255),
            gr_tag_value VARCHAR(255), 
            gr_data_point VARCHAR(255),   
            c_tag_type VARCHAR(255),
            c_tag_value VARCHAR(255), 
            c_data_point VARCHAR(255), 
            pds_tag_type VARCHAR(255),
            pds_tag_value VARCHAR(255), 
            pds_data_point VARCHAR(255),
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );`,
        // Q79
        `CREATE TABLE IF NOT EXISTS dqr_scope_three_other_indirect_emissions_qseventynine (
            stoieqsn_id VARCHAR(255) PRIMARY KEY,
            sgiq_id VARCHAR(255),
            stoie_id VARCHAR(255), --foreign key to scope_three_other_indirect_emissions
            data TEXT, 
            ter_tag_type VARCHAR(255),
            ter_tag_value VARCHAR(255), 
            ter_data_point VARCHAR(255),   
            tir_tag_type VARCHAR(255),
            tir_tag_value VARCHAR(255), 
            tir_data_point VARCHAR(255), 
            gr_tag_type VARCHAR(255),
            gr_tag_value VARCHAR(255), 
            gr_data_point VARCHAR(255),   
            c_tag_type VARCHAR(255),
            c_tag_value VARCHAR(255), 
            c_data_point VARCHAR(255), 
            pds_tag_type VARCHAR(255),
            pds_tag_value VARCHAR(255), 
            pds_data_point VARCHAR(255),
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );`,
        // Q80
        `CREATE TABLE IF NOT EXISTS dqr_scope_three_other_indirect_emissions_qeighty (
            stoieqe_id VARCHAR(255) PRIMARY KEY,
            sgiq_id VARCHAR(255),
            stoie_id VARCHAR(255), --foreign key to scope_three_other_indirect_emissions
            data TEXT, 
            ter_tag_type VARCHAR(255),
            ter_tag_value VARCHAR(255), 
            ter_data_point VARCHAR(255),   
            tir_tag_type VARCHAR(255),
            tir_tag_value VARCHAR(255), 
            tir_data_point VARCHAR(255), 
            gr_tag_type VARCHAR(255),
            gr_tag_value VARCHAR(255), 
            gr_data_point VARCHAR(255),   
            c_tag_type VARCHAR(255),
            c_tag_value VARCHAR(255), 
            c_data_point VARCHAR(255), 
            pds_tag_type VARCHAR(255),
            pds_tag_value VARCHAR(255), 
            pds_data_point VARCHAR(255),
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );`,

        //   ========>DQR Rating Tables end<============

        //   ==========>Data Setup tables<============
        `CREATE TABLE IF NOT EXISTS calculation_method (
            id VARCHAR(255) PRIMARY KEY,
            code VARCHAR(255) NOT NULL, 
            name VARCHAR(255) NOT NULL,       
            description text,
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT uq_calculation_method_code_name UNIQUE (code, name)
  );`,
        `CREATE TABLE IF NOT EXISTS fuel_combustion (
            id VARCHAR(255) PRIMARY KEY,
            code VARCHAR(255) NOT NULL, 
            name VARCHAR(255) NOT NULL,       
            description text,
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT uq_fuel_combustion_code_name UNIQUE (code, name)
  );`,
        `CREATE TABLE IF NOT EXISTS process_emission (
            id VARCHAR(255) PRIMARY KEY,
            code VARCHAR(255) NOT NULL, 
            name VARCHAR(255) NOT NULL,       
            description text,
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT uq_process_emission_code_name UNIQUE (code, name)
  );`,
        `CREATE TABLE IF NOT EXISTS fugitive_emission (
            id VARCHAR(255) PRIMARY KEY,
            code VARCHAR(255) NOT NULL, 
            name VARCHAR(255) NOT NULL,       
            description text,
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT uq_fugitive_emission_code_name UNIQUE (code, name)
  );`,
        `CREATE TABLE IF NOT EXISTS electicity_location_based (
            id VARCHAR(255) PRIMARY KEY,
            code VARCHAR(255) NOT NULL, 
            name VARCHAR(255) NOT NULL,       
            description text,
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT uq_electicity_location_based_code_name UNIQUE (code, name)
  );`,
        `CREATE TABLE IF NOT EXISTS electicity_market_based (
            id VARCHAR(255) PRIMARY KEY,
            code VARCHAR(255) NOT NULL, 
            name VARCHAR(255) NOT NULL,       
            description text,
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT uq_electicity_market_based_code_name UNIQUE (code, name)
  );`,
        `CREATE TABLE IF NOT EXISTS steam_heat_cooling (
            id VARCHAR(255) PRIMARY KEY,
            code VARCHAR(255) NOT NULL, 
            name VARCHAR(255) NOT NULL,       
            description text,
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT uq_steam_heat_cooling_code_name UNIQUE (code, name)
  );`,

        `CREATE TABLE IF NOT EXISTS product_type (
            id VARCHAR(255) PRIMARY KEY,
            code VARCHAR(255) NOT NULL, 
            name VARCHAR(255) NOT NULL,       
            description text,
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT uq_product_type_code_name UNIQUE (code, name)
  );`,

        `CREATE TABLE IF NOT EXISTS product_category (
            id VARCHAR(255) PRIMARY KEY,
            code VARCHAR(255) NOT NULL, 
            name VARCHAR(255) NOT NULL,       
            description text,
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT uq_product_category_code_name UNIQUE (code, name)
  );`,

        `CREATE TABLE IF NOT EXISTS product_sub_category (
            id VARCHAR(255) PRIMARY KEY,
            code VARCHAR(255) NOT NULL, 
            name VARCHAR(255) NOT NULL,       
            description text,
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT uq_product_sub_category_code_name UNIQUE (code, name)
  );`,

        `CREATE TABLE IF NOT EXISTS component_type (
            id VARCHAR(255) PRIMARY KEY,
            code VARCHAR(255) NOT NULL, 
            name VARCHAR(255) NOT NULL,       
            description text,
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT uq_component_type_code_name UNIQUE (code, name)
  );`,

        `CREATE TABLE IF NOT EXISTS component_category (
            id VARCHAR(255) PRIMARY KEY,
            code VARCHAR(255) NOT NULL, 
            name VARCHAR(255) NOT NULL,       
            description text,
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT uq_component_category_code UNIQUE (code),
            CONSTRAINT uq_component_category_name UNIQUE (name)
  );`,

        `CREATE TABLE IF NOT EXISTS industry (
            id VARCHAR(255) PRIMARY KEY,
            code VARCHAR(255) NOT NULL, 
            name VARCHAR(255) NOT NULL,       
            description text,
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT uq_industry_code UNIQUE (code),
            CONSTRAINT uq_industry_name UNIQUE (name)
  );`,

        `CREATE TABLE IF NOT EXISTS category (
            id VARCHAR(255) PRIMARY KEY,
            code VARCHAR(255) NOT NULL, 
            name VARCHAR(255) NOT NULL,       
            description text,
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT uq_category_code UNIQUE (code),
            CONSTRAINT uq_category_name UNIQUE (name)
  );`,

        `CREATE TABLE IF NOT EXISTS tag (
            id VARCHAR(255) PRIMARY KEY,
            code VARCHAR(255) NOT NULL, 
            name VARCHAR(255) NOT NULL,       
            description text,
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT uq_tag_code UNIQUE (code),
            CONSTRAINT uq_tag_name UNIQUE (name)
  );`,

        `CREATE TABLE IF NOT EXISTS transport_mode (
            id VARCHAR(255) PRIMARY KEY,
            code VARCHAR(255) NOT NULL, 
            name VARCHAR(255) NOT NULL,       
            description text,
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT uq_tm_code UNIQUE (code),
            CONSTRAINT uq_tm_name UNIQUE (name)
  );`,

        `CREATE TABLE IF NOT EXISTS material_type (
            id VARCHAR(255) PRIMARY KEY,
            code VARCHAR(255) NOT NULL, 
            name VARCHAR(255) NOT NULL,       
            description text,
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT uq_mt_code UNIQUE (code),
            CONSTRAINT uq_mt_name UNIQUE (name)
  );`,

        `CREATE TABLE IF NOT EXISTS manufacturer (
            id VARCHAR(255) PRIMARY KEY,
            code VARCHAR(255), 
            name VARCHAR(255),       
            address text,
            lat DOUBLE PRECISION,
            long DOUBLE PRECISION,
            email VARCHAR(255) UNIQUE,
            phone_number VARCHAR(255),
            alternate_phone_number VARCHAR(255),
            gender VARCHAR(50),
            date_of_birth DATE,
            image TEXT,
            company_logo TEXT,
            company_website VARCHAR(255),
            factory_or_plant_name TEXT,
            factory_address TEXT,
            city VARCHAR(255),
            state VARCHAR(255),
            country VARCHAR(255),
            manufacturing_capabilities TEXT[],
            installed_capacity_or_month TEXT,
            machinery_list TEXT,
            years_of_operation VARCHAR(255),
            number_of_employees VARCHAR(255),
            key_oem_clients TEXT[],
            iso_9001 TEXT[],
            iso_14001 TEXT[],
            ohsas_18001 TEXT[],
            iatf_16949 TEXT[],
            other_certifications TEXT[],
            reach_compliance TEXT[],
            rohs_ompliance TEXT[],
            conflict_minerals_declaration TEXT[],
            environmental_safety_policy TEXT[],
            factory_layout_pdf TEXT,
            factory_profile_or_capability_deck TEXT,
            qa_or_qc_lab_availability TEXT[],
            testing_certifications TEXT[],
            contact_person_name VARCHAR(255),
            contact_person_designation VARCHAR(255),
            contact_person_email VARCHAR(255),
            contact_person_phone VARCHAR(255),
            updated_by VARCHAR(255),
            created_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT uq_m_code UNIQUE (code),
            CONSTRAINT uq_m_name UNIQUE (name)
  );`,

        `CREATE TABLE IF NOT EXISTS vehicle_detail (
            id VARCHAR(255) PRIMARY KEY,
            code VARCHAR(255), 
            name VARCHAR(255),
            make VARCHAR(255),
            model VARCHAR(255),
            year VARCHAR(255),
            number VARCHAR(255),
            description text,
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT uq_vd_code UNIQUE (code),
            CONSTRAINT uq_vd_name UNIQUE (name)
  );`,

        `CREATE TABLE IF NOT EXISTS fuel_type (
            id VARCHAR(255) PRIMARY KEY,
            code VARCHAR(255) NOT NULL, 
            name VARCHAR(255) NOT NULL,       
            description text,
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT uq_ft_code UNIQUE (code),
            CONSTRAINT uq_ft_name UNIQUE (name)
  );`,

        //   from here to 
        `CREATE TABLE IF NOT EXISTS aluminium_type (
            id VARCHAR(255) PRIMARY KEY,
            code VARCHAR(255) NOT NULL, 
            name VARCHAR(255) NOT NULL,       
            description text,
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT uq_aluminium_code_name UNIQUE (code, name)
  );`,

        `CREATE TABLE IF NOT EXISTS silicon_type (
            id VARCHAR(255) PRIMARY KEY,
            code VARCHAR(255) NOT NULL, 
            name VARCHAR(255) NOT NULL,       
            description text,
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT uq_silicon_code_name UNIQUE (code, name)
  );`,

        `CREATE TABLE IF NOT EXISTS magnesium_type (
            id VARCHAR(255) PRIMARY KEY,
            code VARCHAR(255) NOT NULL, 
            name VARCHAR(255) NOT NULL,       
            description text,
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT uq_cmagnesium_code_name UNIQUE (code, name)
  );`,

        `CREATE TABLE IF NOT EXISTS iron_type (
            id VARCHAR(255) PRIMARY KEY,
            code VARCHAR(255) NOT NULL, 
            name VARCHAR(255) NOT NULL,       
            description text,
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT uq_iron_code_name UNIQUE (code, name)
  );`,
        //   Here these tables needed currently using these below table combining above four

        `CREATE TABLE IF NOT EXISTS material_composition_metal (
            mcm_id VARCHAR(255) PRIMARY KEY,
            code VARCHAR(255) NOT NULL, 
            name VARCHAR(255) NOT NULL,       
            description text,
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT uq_material_composition_metal_code_name UNIQUE (code, name)
  );`,

        `CREATE TABLE IF NOT EXISTS material_composition_metal_type (
            mcmt_id VARCHAR(255) PRIMARY KEY,
            code VARCHAR(255) NOT NULL, 
            name VARCHAR(255) NOT NULL,   
            mcm_id VARCHAR(255),
            value VARCHAR(255),
            description text,
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );`,

        `CREATE TABLE IF NOT EXISTS manufacturing_process (
            id VARCHAR(255) PRIMARY KEY,
            code VARCHAR(255) NOT NULL, 
            name VARCHAR(255) NOT NULL,       
            description text,
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT uq_mp_code_name UNIQUE (code, name)
  );`,

        `CREATE TABLE IF NOT EXISTS life_cycle_stage (
            id VARCHAR(255) PRIMARY KEY,
            code VARCHAR(255) NOT NULL, 
            name VARCHAR(255) NOT NULL,       
            description text,
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT uq_lc_code_name UNIQUE (code, name)
  );`,

        //   ==========>Data Setup tables end<============


        // ===========> Master Data Setup tables start<============
        `CREATE TABLE IF NOT EXISTS material_composition_metals (
            mcm_id VARCHAR(255) PRIMARY KEY,
            code VARCHAR(255) NOT NULL, 
            name VARCHAR(255) NOT NULL,  
            description text,
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );`,
        `CREATE TABLE IF NOT EXISTS country_iso_two (
            citw_id VARCHAR(255) PRIMARY KEY,
            code VARCHAR(255) NOT NULL, 
            name VARCHAR(255) NOT NULL,  
            country_name VARCHAR(255),  
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );`,
        `CREATE TABLE IF NOT EXISTS country_iso_three (
            cith_id VARCHAR(255) PRIMARY KEY,
            code VARCHAR(255) NOT NULL, 
            name VARCHAR(255) NOT NULL,  
            country_name VARCHAR(255),
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );`,
        `CREATE TABLE IF NOT EXISTS scope_two_method (
            stm_id VARCHAR(255) PRIMARY KEY,
            code VARCHAR(255) NOT NULL, 
            name VARCHAR(255) NOT NULL,  
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );`,
        `CREATE TABLE IF NOT EXISTS method_type (
            mt_id VARCHAR(255) PRIMARY KEY,
            code VARCHAR(255) NOT NULL, 
            name VARCHAR(255) NOT NULL,  
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );`,
        `CREATE TABLE IF NOT EXISTS transport_modes (
            tm_id VARCHAR(255) PRIMARY KEY,
            code VARCHAR(255) NOT NULL, 
            name VARCHAR(255) NOT NULL,  
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );`,
        `CREATE TABLE IF NOT EXISTS transport_routes (
            tr_id VARCHAR(255) PRIMARY KEY,
            code VARCHAR(255) NOT NULL, 
            name VARCHAR(255) NOT NULL,  
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );`,
        `CREATE TABLE IF NOT EXISTS packaging_level (
            pl_id VARCHAR(255) PRIMARY KEY,
            code VARCHAR(255) NOT NULL, 
            name VARCHAR(255) NOT NULL,  
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );`,
        `CREATE TABLE IF NOT EXISTS waste_treatment (
            wt_id VARCHAR(255) PRIMARY KEY,
            code VARCHAR(255) NOT NULL, 
            name VARCHAR(255) NOT NULL,  
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );`,
        `CREATE TABLE IF NOT EXISTS refrigerent_type (
            rt_id VARCHAR(255) PRIMARY KEY,
            code VARCHAR(255) NOT NULL, 
            name VARCHAR(255) NOT NULL,  
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );`,
        `CREATE TABLE IF NOT EXISTS liquid_fuel_unit (
            lfu_id VARCHAR(255) PRIMARY KEY,
            code VARCHAR(255) NOT NULL, 
            name VARCHAR(255) NOT NULL,  
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );`,

        `CREATE TABLE IF NOT EXISTS gaseous_fuel_unit (
            gfu_id VARCHAR(255) PRIMARY KEY,
            code VARCHAR(255) NOT NULL, 
            name VARCHAR(255) NOT NULL,  
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );`,

        `CREATE TABLE IF NOT EXISTS solid_fuel_unit (
            sfu_id VARCHAR(255) PRIMARY KEY,
            code VARCHAR(255) NOT NULL, 
            name VARCHAR(255) NOT NULL,  
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );`,

        `CREATE TABLE IF NOT EXISTS process_specific_energy (
            pse_id VARCHAR(255) PRIMARY KEY,
            code VARCHAR(255) NOT NULL, 
            name VARCHAR(255) NOT NULL,  
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );`,

        `CREATE TABLE IF NOT EXISTS fuel_types (
            ft_id VARCHAR(255) PRIMARY KEY,
            code VARCHAR(255) NOT NULL, 
            name VARCHAR(255) NOT NULL,  
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );`,


        `CREATE TABLE IF NOT EXISTS sub_fuel_types (
            sft_id VARCHAR(255) PRIMARY KEY,
            ft_id VARCHAR(255),
            code VARCHAR(255) NOT NULL, 
            name VARCHAR(255) NOT NULL,  
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );`,

        `CREATE TABLE IF NOT EXISTS vehicle_types (
            vt_id VARCHAR(255) PRIMARY KEY,
            code VARCHAR(255) NOT NULL, 
            name VARCHAR(255) NOT NULL,  
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );`,

        `CREATE TABLE IF NOT EXISTS energy_source (
            es_id VARCHAR(255) PRIMARY KEY,
            code VARCHAR(255) NOT NULL, 
            name VARCHAR(255) NOT NULL,  
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );`,

        `CREATE TABLE IF NOT EXISTS energy_type (
            et_id VARCHAR(255) PRIMARY KEY,
            es_id VARCHAR(255),
            code VARCHAR(255) NOT NULL, 
            name VARCHAR(255) NOT NULL,  
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );`,

        `CREATE TABLE IF NOT EXISTS energy_unit (
            eu_id VARCHAR(255) PRIMARY KEY,
            code VARCHAR(255) NOT NULL, 
            name VARCHAR(255) NOT NULL,  
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );`,

        `CREATE TABLE IF NOT EXISTS ef_unit (
            efu_id VARCHAR(255) PRIMARY KEY,
            code VARCHAR(255) NOT NULL, 
            name VARCHAR(255) NOT NULL,  
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );`,

        `CREATE TABLE IF NOT EXISTS allocation_method (
            am_id VARCHAR(255) PRIMARY KEY,
            code VARCHAR(255) NOT NULL, 
            name VARCHAR(255) NOT NULL,  
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );`,

        `CREATE TABLE IF NOT EXISTS certificate_type (
            ct_id VARCHAR(255) PRIMARY KEY,
            code VARCHAR(255) NOT NULL, 
            name VARCHAR(255) NOT NULL,  
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );`,

        `CREATE TABLE IF NOT EXISTS verification_status (
            vs_id VARCHAR(255) PRIMARY KEY,
            code VARCHAR(255) NOT NULL, 
            name VARCHAR(255) NOT NULL,  
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );`,

        `CREATE TABLE IF NOT EXISTS reporting_standard (
            rs_id VARCHAR(255) PRIMARY KEY,
            code VARCHAR(255) NOT NULL, 
            name VARCHAR(255) NOT NULL,  
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );`,

        `CREATE TABLE IF NOT EXISTS life_cycle_boundary (
            lcb_id VARCHAR(255) PRIMARY KEY,
            code VARCHAR(255) NOT NULL, 
            name VARCHAR(255) NOT NULL,  
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );`,

        `CREATE TABLE IF NOT EXISTS life_cycle_stages_of_product (
            lcsp_id VARCHAR(255) PRIMARY KEY,
            code VARCHAR(255) NOT NULL, 
            name VARCHAR(255) NOT NULL,  
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );`,

        `CREATE TABLE IF NOT EXISTS time_zone (
            tmz_id VARCHAR(255) PRIMARY KEY,
            code VARCHAR(255) NOT NULL, 
            name VARCHAR(255) NOT NULL,  
            country_name VARCHAR(255),
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );`,

        `CREATE TABLE IF NOT EXISTS product_unit (
            pu_id VARCHAR(255) PRIMARY KEY,
            code VARCHAR(255) NOT NULL, 
            name VARCHAR(255) NOT NULL,  
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );`,

        `CREATE TABLE IF NOT EXISTS supplier_tier (
            st_id VARCHAR(255) PRIMARY KEY,
            code VARCHAR(255) NOT NULL, 
            name VARCHAR(255) NOT NULL,  
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );`,

        `CREATE TABLE IF NOT EXISTS credit_method (
            cm_id VARCHAR(255) PRIMARY KEY,
            code VARCHAR(255) NOT NULL, 
            name VARCHAR(255) NOT NULL,  
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );`,

        `CREATE TABLE IF NOT EXISTS water_source (
            ws_id VARCHAR(255) PRIMARY KEY,
            code VARCHAR(255) NOT NULL, 
            name VARCHAR(255) NOT NULL,  
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );`,

        `CREATE TABLE IF NOT EXISTS water_unit (
            wu_id VARCHAR(255) PRIMARY KEY,
            code VARCHAR(255) NOT NULL, 
            name VARCHAR(255) NOT NULL,  
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );`,

        `CREATE TABLE IF NOT EXISTS water_treatment (
            wt_id VARCHAR(255) PRIMARY KEY,
            code VARCHAR(255) NOT NULL, 
            name VARCHAR(255) NOT NULL,  
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );`,

        `CREATE TABLE IF NOT EXISTS discharge_destination (
            dd_id VARCHAR(255) PRIMARY KEY,
            code VARCHAR(255) NOT NULL, 
            name VARCHAR(255) NOT NULL,  
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );`,

        `CREATE TABLE IF NOT EXISTS qc_equipment_unit (
            qcqu_id VARCHAR(255) PRIMARY KEY,
            code VARCHAR(255) NOT NULL, 
            name VARCHAR(255) NOT NULL,  
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );`,

        `CREATE TABLE IF NOT EXISTS packing_unit (
            pau_id VARCHAR(255) PRIMARY KEY,
            code VARCHAR(255) NOT NULL, 
            name VARCHAR(255) NOT NULL,  
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );`,

        // ===========> Master Data Setup tables end<============

        // ==============> Legacy ECOInvent helper lookup tables <================
        // The 6 legacy EF tables (materials, electricity, fuel, packaging, vehicle,
        // waste material) have been replaced by the unified emission_factors table
        // (see bottom of file). The small helper lookup tables below
        // (waste_treatment_type, unit_conversion, packaging_treatment_type) are
        // retained — they may still be referenced by Phase 2 questionnaire rewires.

        `CREATE TABLE IF NOT EXISTS waste_treatment_type (
            wtt_id VARCHAR(255) PRIMARY KEY,
            code VARCHAR(255), 
            name VARCHAR(255),  
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );`,

// Unit Conversion Table.
        `CREATE TABLE IF NOT EXISTS unit_conversion (
    uc_id VARCHAR(255) PRIMARY KEY,
    unit_name VARCHAR(255),
    unit_symbol VARCHAR(255),
    unit_category VARCHAR(255),
    base_unit VARCHAR(255),
    conversion_factor_to_base NUMERIC(20, 10),
    code VARCHAR(255),
    created_by VARCHAR(255) DEFAULT 'system',
    updated_by VARCHAR(255),
    update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);`,
        // ENERGY UNITS → kWh base
        `INSERT INTO unit_conversion (uc_id, unit_name, unit_symbol, unit_category, base_unit, conversion_factor_to_base, code, created_by) VALUES
('UC001', 'Joule', 'J', 'energy', 'kWh', 0.000000278, 'UC-J', 'system'),
('UC002', 'Kilojoule', 'kJ', 'energy', 'kWh', 0.000278, 'UC-kJ', 'system'),
('UC003', 'Megajoule', 'MJ', 'energy', 'kWh', 0.278, 'UC-MJ', 'system'),
('UC004', 'Gigajoule', 'GJ', 'energy', 'kWh', 278, 'UC-GJ', 'system'),
('UC005', 'Watt-hour', 'Wh', 'energy', 'kWh', 0.001, 'UC-Wh', 'system'),
('UC006', 'Kilowatt-hour', 'kWh', 'energy', 'kWh', 1, 'UC-kWh', 'system'),
('UC007', 'Megawatt-hour', 'MWh', 'energy', 'kWh', 1000, 'UC-MWh', 'system'),
('UC008', 'Gigawatt-hour', 'GWh', 'energy', 'kWh', 1000000, 'UC-GWh', 'system'),
('UC009', 'Terawatt-hour', 'TWh', 'energy', 'kWh', 1000000000, 'UC-TWh', 'system')
ON CONFLICT (uc_id) DO NOTHING;`,

        // FUEL/VOLUME UNITS → Liters base
        `INSERT INTO unit_conversion (uc_id, unit_name, unit_symbol, unit_category, base_unit, conversion_factor_to_base, code, created_by) VALUES
('UC010', 'Milliliter', 'ml', 'fuel', 'Liters', 0.001, 'UC-ml', 'system'),
('UC011', 'Centiliter', 'cL', 'fuel', 'Liters', 0.01, 'UC-cL', 'system'),
('UC012', 'Deciliter', 'dL', 'fuel', 'Liters', 0.1, 'UC-dL', 'system'),
('UC013', 'Liter', 'L', 'fuel', 'Liters', 1, 'UC-L', 'system'),
('UC014', 'Cubic Meter', 'm3', 'fuel', 'Liters', 1000, 'UC-m3', 'system'),
('UC015', 'Gallon (US)', 'gal (US)', 'fuel', 'Liters', 3.78541, 'UC-galUS', 'system'),
('UC016', 'Gallon (UK)', 'gal (UK)', 'fuel', 'Liters', 4.54609, 'UC-galUK', 'system'),
('UC017', 'Quart (US)', 'qt (US)', 'fuel', 'Liters', 0.946353, 'UC-qtUS', 'system'),
('UC018', 'Pint (US)', 'pt (US)', 'fuel', 'Liters', 0.473176, 'UC-ptUS', 'system'),
('UC019', 'Fluid Ounce (US)', 'fl oz (US)', 'fuel', 'Liters', 0.0295735, 'UC-flozUS', 'system'),
('UC020', 'Cubic Inch', 'in3', 'fuel', 'Liters', 0.0163871, 'UC-in3', 'system'),
('UC021', 'Cubic Foot', 'ft3', 'fuel', 'Liters', 28.3168, 'UC-ft3', 'system'),
('UC022', 'Barrel (Oil)', 'bbl', 'fuel', 'Liters', 158.987, 'UC-bbl', 'system'),
('UC023', 'Therm (US)', 'therm', 'fuel', 'Liters', 26.85, 'UC-therm', 'system'),
('UC024', 'Million BTU', 'MMBtu', 'fuel', 'Liters', 26.17, 'UC-MMBtu', 'system')
ON CONFLICT (uc_id) DO NOTHING;`,

        // MATERIAL/MASS UNITS → kg base
        `INSERT INTO unit_conversion (uc_id, unit_name, unit_symbol, unit_category, base_unit, conversion_factor_to_base, code, created_by) VALUES
('UC025', 'Milligram', 'mg', 'material', 'kg', 0.000001, 'UC-mg', 'system'),
('UC026', 'Gram', 'g', 'material', 'kg', 0.001, 'UC-g', 'system'),
('UC027', 'Kilogram', 'kg', 'material', 'kg', 1, 'UC-kg', 'system'),
('UC028', 'Metric Tonne', 'tonne', 'material', 'kg', 1000, 'UC-tonne', 'system'),
('UC029', 'Pound', 'lb', 'material', 'kg', 0.453592, 'UC-lb', 'system'),
('UC030', 'Short Ton (US)', 'US ton', 'material', 'kg', 907.1847, 'UC-USton', 'system'),
('UC031', 'Long Ton (UK)', 'UK ton', 'material', 'kg', 1016.05, 'UC-UKton', 'system')
ON CONFLICT (uc_id) DO NOTHING;`,

        `CREATE TABLE IF NOT EXISTS packaging_treatment_type (
            ptt_id VARCHAR(255) PRIMARY KEY,
            code VARCHAR(255), 
            name VARCHAR(255),  
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );`,

        // <=======================END<================

        // Reports
        `CREATE TABLE IF NOT EXISTS favorite_reports (
    fr_id VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(255) UNIQUE, 
    is_product_footprint BOOLEAN DEFAULT FALSE,  
    is_supplier_footprint BOOLEAN DEFAULT FALSE,  
    is_material_footprint BOOLEAN DEFAULT FALSE,  
    is_electricity_footprint BOOLEAN DEFAULT FALSE,  
    is_transportation_footprint BOOLEAN DEFAULT FALSE, 
    is_packaging_footprint BOOLEAN DEFAULT FALSE,
    is_dqr_rating_footprint BOOLEAN DEFAULT FALSE, 
    created_by VARCHAR(255),
    updated_by VARCHAR(255),
    update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);`,

        // ========AMS

        `CREATE TABLE IF NOT EXISTS notification (
    ntf_id VARCHAR(255) PRIMARY KEY,
    notification_code VARCHAR(50),
    alert_name VARCHAR(50),
    event_type VARCHAR(255),
    priority VARCHAR(50),
    condition_type VARCHAR(50),
    transaction_type VARCHAR(50),
    table_names TEXT,
    column_condition TEXT,
    frequency VARCHAR(50),
    frequency_accurrence VARCHAR(50),
    frequency_time_gap VARCHAR(50),
    frequency_first_alert VARCHAR(50),
    is_email BOOLEAN DEFAULT FALSE,
    is_sms BOOLEAN DEFAULT FALSE,
    is_push_notification BOOLEAN DEFAULT FALSE,
    is_whatsapp BOOLEAN DEFAULT FALSE,
    sql_query TEXT,
    status VARCHAR(50),
    created_by VARCHAR(255),
    updated_by VARCHAR(255),
    start_or_stop BOOLEAN DEFAULT FALSE,
    update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );`,

        `CREATE TABLE IF NOT EXISTS notification_communication_channel (
    ntfcc_id VARCHAR(255) PRIMARY KEY,
    ntf_id VARCHAR(255),
    template_id VARCHAR(255),
    template_name VARCHAR(50),
    subject TEXT,
    body TEXT,
    attachments TEXT,
    is_email BOOLEAN DEFAULT FALSE,
    is_sms BOOLEAN DEFAULT FALSE,
    is_push_notification BOOLEAN DEFAULT FALSE,
    is_whatsapp BOOLEAN DEFAULT FALSE,
    transaction_status BOOLEAN DEFAULT FALSE,
    created_by VARCHAR(255),
    updated_by VARCHAR(255),
    update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    sms_config_id VARCHAR(255),
    whatsapp_config_id VARCHAR(255),
    notification_config_id VARCHAR(255),
    type VARCHAR(50)
  );`,

        `CREATE TABLE IF NOT EXISTS notification_recipient (
    ntfr_id VARCHAR(255) PRIMARY KEY,
    ntf_id VARCHAR(255),
    ntfcc_id VARCHAR(255),
    recipient_group TEXT[],
    recipient_users TEXT[],
    specific_users TEXT[],
    is_email BOOLEAN DEFAULT FALSE,
    is_sms BOOLEAN DEFAULT FALSE,
    is_push_notification BOOLEAN DEFAULT FALSE,
    is_whatsapp BOOLEAN DEFAULT FALSE,
    created_by VARCHAR(255),
    updated_by VARCHAR(255),
    update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    type VARCHAR(50)
  );`,

        `CREATE TABLE IF NOT EXISTS notification_triggered_history (
    nth_id VARCHAR(255) PRIMARY KEY,
    ntf_id VARCHAR(255),
    status VARCHAR(50),
   update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );`,

        `CREATE TABLE IF NOT EXISTS notification_config (
    id VARCHAR(255) PRIMARY KEY,
    event_name VARCHAR(100) NOT NULL UNIQUE,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    fcm_topic VARCHAR(100),
    priority VARCHAR(10) DEFAULT 'high',
    sound VARCHAR(50) DEFAULT 'default',
    data JSONB,
    status BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
`,

        `ALTER TABLE mode_of_transport_used_for_transportation_questions
ADD COLUMN IF NOT EXISTS source_lat DECIMAL,
ADD COLUMN IF NOT EXISTS source_lng DECIMAL,
ADD COLUMN IF NOT EXISTS drop_lat DECIMAL,
ADD COLUMN IF NOT EXISTS drop_lng DECIMAL;
`,

        // ============================================================
        // EF schema redesign - Step 1: add layer fields to 7 supplier
        // questionnaire response tables. Layers stored as text snapshot
        // (point-in-time copy); ef_code is a soft pointer with no FK
        // so that EF re-imports don't break historical responses.
        // Old material_name / material_type columns kept for legacy reads.
        // All nullable at DB level — Layer4 non-null enforced at the
        // controller layer for new submissions only.
        // ============================================================

        `ALTER TABLE raw_materials_used_in_component_manufacturing_questions
ADD COLUMN IF NOT EXISTS layer1 VARCHAR(255),
ADD COLUMN IF NOT EXISTS layer2 VARCHAR(255),
ADD COLUMN IF NOT EXISTS layer3 VARCHAR(255),
ADD COLUMN IF NOT EXISTS layer4 VARCHAR(255),
ADD COLUMN IF NOT EXISTS ef_code VARCHAR(255);
`,

        `ALTER TABLE recycled_materials_with_percentage_questions
ADD COLUMN IF NOT EXISTS layer1 VARCHAR(255),
ADD COLUMN IF NOT EXISTS layer2 VARCHAR(255),
ADD COLUMN IF NOT EXISTS layer3 VARCHAR(255),
ADD COLUMN IF NOT EXISTS layer4 VARCHAR(255),
ADD COLUMN IF NOT EXISTS ef_code VARCHAR(255);
`,

        `ALTER TABLE pir_pcr_material_percentage_questions
ADD COLUMN IF NOT EXISTS layer1 VARCHAR(255),
ADD COLUMN IF NOT EXISTS layer2 VARCHAR(255),
ADD COLUMN IF NOT EXISTS layer3 VARCHAR(255),
ADD COLUMN IF NOT EXISTS layer4 VARCHAR(255),
ADD COLUMN IF NOT EXISTS ef_code VARCHAR(255);
`,

        `ALTER TABLE scope_two_indirect_emissions_from_purchased_energy_questions
ADD COLUMN IF NOT EXISTS layer1 VARCHAR(255),
ADD COLUMN IF NOT EXISTS layer2 VARCHAR(255),
ADD COLUMN IF NOT EXISTS layer3 VARCHAR(255),
ADD COLUMN IF NOT EXISTS layer4 VARCHAR(255),
ADD COLUMN IF NOT EXISTS ef_code VARCHAR(255);
`,

        `ALTER TABLE weight_of_packaging_per_unit_product_questions
ADD COLUMN IF NOT EXISTS layer1 VARCHAR(255),
ADD COLUMN IF NOT EXISTS layer2 VARCHAR(255),
ADD COLUMN IF NOT EXISTS layer3 VARCHAR(255),
ADD COLUMN IF NOT EXISTS layer4 VARCHAR(255),
ADD COLUMN IF NOT EXISTS ef_code VARCHAR(255);
`,

        `ALTER TABLE weight_of_pro_packaging_waste_questions
ADD COLUMN IF NOT EXISTS layer1 VARCHAR(255),
ADD COLUMN IF NOT EXISTS layer2 VARCHAR(255),
ADD COLUMN IF NOT EXISTS layer3 VARCHAR(255),
ADD COLUMN IF NOT EXISTS layer4 VARCHAR(255),
ADD COLUMN IF NOT EXISTS ef_code VARCHAR(255);
`,

        `ALTER TABLE mode_of_transport_used_for_transportation_questions
ADD COLUMN IF NOT EXISTS layer1 VARCHAR(255),
ADD COLUMN IF NOT EXISTS layer2 VARCHAR(255),
ADD COLUMN IF NOT EXISTS layer3 VARCHAR(255),
ADD COLUMN IF NOT EXISTS layer4 VARCHAR(255),
ADD COLUMN IF NOT EXISTS ef_code VARCHAR(255);
`,

        // Q60 actually saves to type_of_pack_mat_used_for_delivering_questions
        // (the weight_of_packaging_per_unit_product_questions table is unused —
        // Q61 was merged into Q60). Adding layer fields here so Q8 packaging
        // submissions can carry layer1-4 + ef_code.
        `ALTER TABLE type_of_pack_mat_used_for_delivering_questions
ADD COLUMN IF NOT EXISTS layer1 VARCHAR(255),
ADD COLUMN IF NOT EXISTS layer2 VARCHAR(255),
ADD COLUMN IF NOT EXISTS layer3 VARCHAR(255),
ADD COLUMN IF NOT EXISTS layer4 VARCHAR(255),
ADD COLUMN IF NOT EXISTS ef_code VARCHAR(255);
`,

        `CREATE TABLE IF NOT EXISTS quintari_published_pcfs (
            id VARCHAR(255) PRIMARY KEY,
            bom_pcf_request_id VARCHAR(255) NOT NULL,
            product_code VARCHAR(255) NOT NULL,
            digital_twin_id VARCHAR(255) NOT NULL,
            part_type_information_submodel_id VARCHAR(255),
            pcf_submodel_id VARCHAR(255) NOT NULL,
            catena_x_id VARCHAR(255),
            pcf_aspect_version VARCHAR(64) DEFAULT '9.0.0',
            pushed_overall_pcf DOUBLE PRECISION,
            published_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            last_answered_at TIMESTAMPTZ,
            answer_count INTEGER DEFAULT 0,
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(bom_pcf_request_id)
        );`,

        `CREATE INDEX IF NOT EXISTS idx_quintari_published_pcfs_product_code
            ON quintari_published_pcfs (product_code);`,

        `CREATE INDEX IF NOT EXISTS idx_quintari_published_pcfs_pcf_submodel_id
            ON quintari_published_pcfs (pcf_submodel_id);`,

        // ==============> BAFU 2025 unified Emission Factor master <================
        // Replaces the 6 legacy ECOInvent EF tables (materials, electricity, fuel,
        // packaging, vehicle, waste) with a single flat table sourced from the
        // BAFU 2025 CSV. ~11k rows. Loaded via admin "Replace from CSV" upload.

        `DROP TABLE IF EXISTS materials_emission_factor CASCADE;`,
        `DROP TABLE IF EXISTS waste_material_treatment_type_emission_factor CASCADE;`,
        `DROP TABLE IF EXISTS electricity_emission_factor CASCADE;`,
        `DROP TABLE IF EXISTS fuel_emission_factor CASCADE;`,
        `DROP TABLE IF EXISTS packaging_material_treatment_type_emission_factor CASCADE;`,
        `DROP TABLE IF EXISTS vehicle_type_emission_factor CASCADE;`,

        // NOTE: this migration runs on EVERY server boot, so it uses
        // CREATE TABLE IF NOT EXISTS and never bare-DROPs emission_factors
        // (a drop here would wipe the imported BAFU data on every restart).
        // To convert an EXISTING old-schema table to the new shape below, run
        // ONCE in pgAdmin:  DROP TABLE IF EXISTS emission_factors CASCADE;
        // then reboot - the CREATE below recreates it with the new columns.

        // Columns map 1:1 to the 7 BAFU CSV columns, plus `domain` (stamped per
        // source file), `is_legacy`, `search_text` and audit timestamps.
        //   CSV col 1 Category          -> category
        //   CSV col 2 Sub-category      -> sub_category
        //   CSV col 3 Group             -> group_name   (`group` is reserved)
        //   CSV col 4 Specific Type     -> specific_type (the EF name/dropdown label)
        //   CSV col 5 Geography         -> geography
        //   CSV col 6 Unit              -> unit
        //   CSV col 7 GWP 100 [kgCO2e]  -> gwp_100
        // NOTE: the old "Dataset Name" column was dropped — the new source file
        // has no such column; `specific_type` is now the sole EF name and the
        // dedup key.
        `CREATE TABLE IF NOT EXISTS emission_factors (
            ef_id          BIGSERIAL PRIMARY KEY,
            domain         TEXT NOT NULL,
            category       TEXT NOT NULL,
            sub_category   TEXT,
            group_name     TEXT,
            specific_type  TEXT NOT NULL,
            geography      TEXT NOT NULL,
            unit           TEXT NOT NULL,
            gwp_100        NUMERIC(20, 6) NOT NULL,
            is_legacy      BOOLEAN NOT NULL DEFAULT false,
            search_text    TEXT,
            source_db      TEXT DEFAULT 'BAFU 2025',
            created_at     TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            updated_at     TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );`,
        // NOTE: no UNIQUE/dedup constraint — every source row is imported
        // verbatim so the row count always matches the file exactly (10,305).

        // --- Indexes ---
        // Unit hard-gate lookup (domain + unit) — the primary access path.
        `CREATE INDEX IF NOT EXISTS idx_emission_factors_domain_unit
            ON emission_factors (domain, unit);`,
        // Cascade dropdown / taxonomy navigation.
        `CREATE INDEX IF NOT EXISTS idx_emission_factors_taxonomy
            ON emission_factors (domain, category, sub_category, group_name);`,
        // Geography filtering / fallback.
        `CREATE INDEX IF NOT EXISTS idx_emission_factors_geography
            ON emission_factors (geography);`,
        // Fast path over live (non-legacy) rows only.
        `CREATE INDEX IF NOT EXISTS idx_emission_factors_active
            ON emission_factors (domain, unit) WHERE is_legacy = false;`,
        // Fuzzy text matching for the semantic layer (requires pg_trgm).
        `CREATE EXTENSION IF NOT EXISTS pg_trgm;`,
        `CREATE INDEX IF NOT EXISTS idx_emission_factors_search_trgm
            ON emission_factors USING gin (search_text gin_trgm_ops);`,

        // ============================================================
        // 28-question supplier questionnaire (Catena-X PCF v9.0.0)
        // Added 2026-06-15. See FINAL_POSTMAN_JSON.json and the
        // Final_Catena-x_Reporting_Structure CSV for the source spec.
        // ============================================================

        // Main response: one row per supplier per PCF request.
        // Holds every single-row Q answer; multi-row Qs live in sq_qN_* tables.
        `CREATE TABLE IF NOT EXISTS supplier_questionnaire_response (
            id VARCHAR(255) PRIMARY KEY,
            bom_pcf_request_id VARCHAR(255) NOT NULL,
            supplier_id VARCHAR(255) NOT NULL,
            status VARCHAR(32) DEFAULT 'draft',
            submitted_at TIMESTAMPTZ,
            -- Q1 Company
            company_name TEXT,
            company_id_urn TEXT,
            -- Q2 Product
            product_name_company TEXT,
            product_id_urn TEXT,
            product_description TEXT,
            product_classification_urn TEXT,
            -- Q3 Declared unit
            declared_unit VARCHAR(64),
            declared_unit_amount DOUBLE PRECISION,
            product_mass_per_declared_unit DOUBLE PRECISION,
            -- Q5 Time
            reference_period_start DATE,
            reference_period_end DATE,
            validity_period_start DATE,
            validity_period_end DATE,
            -- Q6 PCF type
            retro_or_prospective_pcf_type VARCHAR(128),
            -- Q7 System boundary (stores the full descriptive label from the UI)
            system_boundary TEXT DEFAULT 'cradle-to-gate',
            -- Q9 Co-products
            co_products_present BOOLEAN DEFAULT FALSE,
            -- Q15 Packaging include
            packaging_emissions_included BOOLEAN DEFAULT TRUE,
            -- Q18 Distribution boundary
            distribution_stage_included BOOLEAN DEFAULT FALSE,
            -- Q20 flat (multi-row biomass lives in sq_q20_biomass_feedstock)
            uses_agricultural_forestry_land BOOLEAN,
            land_area_hectares DOUBLE PRECISION,
            forest_converted_y_n BOOLEAN,
            luc_emission_factor DOUBLE PRECISION,
            -- Q21 Standards
            cross_sectoral_standards TEXT,
            product_or_sector_specific_rules TEXT,
            ipcc_gwp_version TEXT DEFAULT 'AR6',
            -- Q22 Mass balancing
            mass_balancing_used BOOLEAN DEFAULT FALSE,
            mass_balancing_certificate_scheme TEXT,
            free_attribution_in_mass_balancing BOOLEAN,
            -- Q23 Allocation
            allocation_rules_description TEXT,
            allocation_recycled_carbon TEXT DEFAULT 'cut-off',
            allocation_waste_incineration TEXT DEFAULT 'polluter pays principle',
            -- Q24 Boundary
            boundary_processes_description TEXT,
            ccs_co2_capture_included BOOLEAN DEFAULT FALSE,
            exempted_emissions_description TEXT,
            exempted_emissions_percent DOUBLE PRECISION DEFAULT 0,
            -- Q25 DQR
            primary_data_share_pct DOUBLE PRECISION,
            secondary_ef_sources TEXT,
            data_collected_year INTEGER,
            technological_dqr DOUBLE PRECISION,
            temporal_dqr DOUBLE PRECISION,
            geographical_dqr DOUBLE PRECISION,
            -- Q26 Certification + Verification
            is_product_certified BOOLEAN,
            certification_scheme TEXT,
            certificate_number TEXT,
            certificate_valid_from DATE,
            certificate_valid_to DATE,
            is_pcf_verified BOOLEAN,
            attestation_type TEXT,
            attestation_conformant_standards TEXT,
            attestation_scheme_standard TEXT,
            attestation_of_conformance_id TEXT,
            attestation_provider_name TEXT,
            attestation_provider_id TEXT,
            attestation_link TEXT,
            attestation_completed_at TIMESTAMPTZ,
            -- Q27 Volumes
            total_production_volume DOUBLE PRECISION,
            certified_volume DOUBLE PRECISION,
            verified_volume_1st_party DOUBLE PRECISION,
            verified_volume_2nd_party DOUBLE PRECISION,
            verified_volume_3rd_party DOUBLE PRECISION,
            total_product_volume DOUBLE PRECISION,
            -- Q28 Comments
            comments TEXT,
            -- timestamps
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(bom_pcf_request_id, supplier_id)
        );`,
        `CREATE INDEX IF NOT EXISTS idx_sqr_bom_pcf_request_id
            ON supplier_questionnaire_response (bom_pcf_request_id);`,
        `CREATE INDEX IF NOT EXISTS idx_sqr_supplier_id
            ON supplier_questionnaire_response (supplier_id);`,
        `CREATE INDEX IF NOT EXISTS idx_sqr_status
            ON supplier_questionnaire_response (status);`,

        // Q10 electricity factory-allocation inputs (added later). Per-unit
        // production electricity = (component_weight / factory_weight) ×
        // factory_energy / num_products, then × electricity EF.
        `ALTER TABLE supplier_questionnaire_response
            ADD COLUMN IF NOT EXISTS factory_total_energy_kwh DOUBLE PRECISION,
            ADD COLUMN IF NOT EXISTS factory_total_weight_kg DOUBLE PRECISION,
            ADD COLUMN IF NOT EXISTS component_total_weight_kg DOUBLE PRECISION,
            ADD COLUMN IF NOT EXISTS component_num_products DOUBLE PRECISION;`,

        // Q4: manufacturing sites
        `CREATE TABLE IF NOT EXISTS sq_q4_sites (
            id VARCHAR(255) PRIMARY KEY,
            response_id VARCHAR(255) NOT NULL,
            site_name TEXT,
            site_address TEXT,
            region TEXT,
            country VARCHAR(8),
            country_subdivision VARCHAR(16),
            is_primary BOOLEAN DEFAULT FALSE,
            notes TEXT,
            row_order INTEGER DEFAULT 0,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );`,
        `CREATE INDEX IF NOT EXISTS idx_sq_q4_response_id ON sq_q4_sites (response_id);`,

        // Q8: BOM components
        `CREATE TABLE IF NOT EXISTS sq_q8_bom (
            id VARCHAR(255) PRIMARY KEY,
            response_id VARCHAR(255) NOT NULL,
            product_id_or_mpn TEXT,
            component_name TEXT,
            material TEXT,
            process TEXT,
            mass_pct DOUBLE PRECISION,
            carbon_pct DOUBLE PRECISION,
            biogenic_y_n BOOLEAN,
            biogenic_carbon_pct DOUBLE PRECISION,
            recycled_y_n BOOLEAN,
            recycled_carbon_pct DOUBLE PRECISION,
            row_order INTEGER DEFAULT 0,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );`,
        // Q8 EF taxonomy (cascade). `material` already holds the Category value;
        // add the deeper levels so the engine can match the exact EF row.
        `ALTER TABLE sq_q8_bom
            ADD COLUMN IF NOT EXISTS sub_category TEXT,
            ADD COLUMN IF NOT EXISTS group_name TEXT,
            ADD COLUMN IF NOT EXISTS specific_type TEXT;`,
        // EF taxonomy cascade for the other emission tables (waste / packaging /
        // packaging-transport / packaging-waste / transport). category +
        // sub_category + group_name + specific_type pin the exact EF.
        `ALTER TABLE supplier_questionnaire_response
            ADD COLUMN IF NOT EXISTS form_snapshot JSONB;`,
        `ALTER TABLE sq_q10_electricity
            ADD COLUMN IF NOT EXISTS category TEXT,
            ADD COLUMN IF NOT EXISTS sub_category TEXT,
            ADD COLUMN IF NOT EXISTS group_name TEXT,
            ADD COLUMN IF NOT EXISTS specific_type TEXT,
            ADD COLUMN IF NOT EXISTS geography TEXT;`,
        `ALTER TABLE sq_q11_fuels
            ADD COLUMN IF NOT EXISTS category TEXT,
            ADD COLUMN IF NOT EXISTS sub_category TEXT,
            ADD COLUMN IF NOT EXISTS group_name TEXT,
            ADD COLUMN IF NOT EXISTS specific_type TEXT;`,
        `ALTER TABLE sq_q13_qc_it_energy
            ADD COLUMN IF NOT EXISTS category TEXT,
            ADD COLUMN IF NOT EXISTS sub_category TEXT,
            ADD COLUMN IF NOT EXISTS group_name TEXT,
            ADD COLUMN IF NOT EXISTS specific_type TEXT,
            ADD COLUMN IF NOT EXISTS geography TEXT;`,
        `ALTER TABLE sq_q14_production_waste
            ADD COLUMN IF NOT EXISTS category TEXT,
            ADD COLUMN IF NOT EXISTS sub_category TEXT,
            ADD COLUMN IF NOT EXISTS group_name TEXT,
            ADD COLUMN IF NOT EXISTS specific_type TEXT;`,
        `ALTER TABLE sq_q16_packaging_materials
            ADD COLUMN IF NOT EXISTS category TEXT,
            ADD COLUMN IF NOT EXISTS sub_category TEXT,
            ADD COLUMN IF NOT EXISTS group_name TEXT,
            ADD COLUMN IF NOT EXISTS specific_type TEXT;`,
        `ALTER TABLE sq_q16a_packaging_transport
            ADD COLUMN IF NOT EXISTS category TEXT,
            ADD COLUMN IF NOT EXISTS sub_category TEXT,
            ADD COLUMN IF NOT EXISTS group_name TEXT,
            ADD COLUMN IF NOT EXISTS specific_type TEXT;`,
        `ALTER TABLE sq_q17_packaging_waste
            ADD COLUMN IF NOT EXISTS category TEXT,
            ADD COLUMN IF NOT EXISTS sub_category TEXT,
            ADD COLUMN IF NOT EXISTS group_name TEXT,
            ADD COLUMN IF NOT EXISTS specific_type TEXT;`,
        `ALTER TABLE sq_q19_transport_legs
            ADD COLUMN IF NOT EXISTS category TEXT,
            ADD COLUMN IF NOT EXISTS sub_category TEXT,
            ADD COLUMN IF NOT EXISTS group_name TEXT,
            ADD COLUMN IF NOT EXISTS specific_type TEXT;`,
        // --- Widen narrow questionnaire text columns to VARCHAR(100). ---------
        // These were originally sized for ISO codes (country=8, subdivision=16)
        // or short enums, but the form lets suppliers type full names (e.g. a
        // state name > 16 chars) → "value too long for type character varying(16)"
        // on submit. Runs after the CREATE TABLEs above, so it fixes both the
        // existing live DB and fresh installs. Idempotent: re-widening to the
        // same type is a no-op. Widen, never narrow (safe on existing data).
        `ALTER TABLE sq_q4_sites
            ALTER COLUMN country TYPE VARCHAR(100),
            ALTER COLUMN country_subdivision TYPE VARCHAR(100);`,
        `ALTER TABLE sq_q9a_coproducts
            ALTER COLUMN price_currency TYPE VARCHAR(100);`,
        `ALTER TABLE sq_q10_electricity ALTER COLUMN unit TYPE VARCHAR(100);`,
        `ALTER TABLE sq_q11_fuels ALTER COLUMN unit TYPE VARCHAR(100);`,
        `ALTER TABLE sq_q12_process_gases
            ALTER COLUMN fossil_or_biogenic TYPE VARCHAR(100),
            ALTER COLUMN unit TYPE VARCHAR(100);`,
        `ALTER TABLE sq_q13_qc_it_energy ALTER COLUMN unit TYPE VARCHAR(100);`,
        `ALTER TABLE sq_q14_production_waste ALTER COLUMN unit TYPE VARCHAR(100);`,
        `ALTER TABLE sq_q16_packaging_materials
            ALTER COLUMN country TYPE VARCHAR(100),
            ALTER COLUMN unit TYPE VARCHAR(100);`,
        `ALTER TABLE sq_q16a_packaging_transport ALTER COLUMN unit TYPE VARCHAR(100);`,
        `ALTER TABLE sq_q17_packaging_waste ALTER COLUMN unit TYPE VARCHAR(100);`,
        `ALTER TABLE sq_q19_transport_legs ALTER COLUMN unit TYPE VARCHAR(100);`,
        `ALTER TABLE sq_q20_biomass_feedstock ALTER COLUMN unit TYPE VARCHAR(100);`,
        `CREATE INDEX IF NOT EXISTS idx_sq_q8_response_id ON sq_q8_bom (response_id);`,

        // Q9a: co-products
        `CREATE TABLE IF NOT EXISTS sq_q9a_coproducts (
            id VARCHAR(255) PRIMARY KEY,
            response_id VARCHAR(255) NOT NULL,
            mpn TEXT,
            component_name TEXT,
            co_product_name TEXT,
            co_product_price DOUBLE PRECISION,
            price_currency VARCHAR(16),
            is_primary_product BOOLEAN DEFAULT FALSE,
            row_order INTEGER DEFAULT 0,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );`,
        `CREATE INDEX IF NOT EXISTS idx_sq_q9a_response_id ON sq_q9a_coproducts (response_id);`,

        // Q10: electricity
        `CREATE TABLE IF NOT EXISTS sq_q10_electricity (
            id VARCHAR(255) PRIMARY KEY,
            response_id VARCHAR(255) NOT NULL,
            electricity_type TEXT,
            generator_type TEXT,
            quantity DOUBLE PRECISION,
            unit VARCHAR(32),
            renewable_pct DOUBLE PRECISION,
            renewable_sourcing TEXT,
            infrastructure_emissions_included BOOLEAN,
            row_order INTEGER DEFAULT 0,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );`,
        `CREATE INDEX IF NOT EXISTS idx_sq_q10_response_id ON sq_q10_electricity (response_id);`,

        // Q10a: per-product total weight produced at the factory (one row per MPN).
        // Summed across rows → factory-total weight = the electricity allocation
        // denominator. Q10b: units produced per product.
        `CREATE TABLE IF NOT EXISTS sq_q10a_factory_weights (
            id VARCHAR(255) PRIMARY KEY,
            response_id VARCHAR(255) NOT NULL,
            mpn TEXT,
            total_weight_kg DOUBLE PRECISION,
            row_order INTEGER DEFAULT 0,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );`,
        `CREATE INDEX IF NOT EXISTS idx_sq_q10a_response_id ON sq_q10a_factory_weights (response_id);`,
        `CREATE TABLE IF NOT EXISTS sq_q10b_factory_units (
            id VARCHAR(255) PRIMARY KEY,
            response_id VARCHAR(255) NOT NULL,
            mpn TEXT,
            units_produced DOUBLE PRECISION,
            row_order INTEGER DEFAULT 0,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );`,
        `CREATE INDEX IF NOT EXISTS idx_sq_q10b_response_id ON sq_q10b_factory_units (response_id);`,

        // Q8b: process consumable materials (auxiliaries) used in production but
        // NOT in the BOM. mass-allocated per component × EF, added to the total.
        `CREATE TABLE IF NOT EXISTS sq_q8b_process_consumables (
            id VARCHAR(255) PRIMARY KEY,
            response_id VARCHAR(255) NOT NULL,
            mpn TEXT,
            consumable_material TEXT,
            category TEXT,
            sub_category TEXT,
            group_name TEXT,
            specific_type TEXT,
            total_quantity DOUBLE PRECISION,
            unit VARCHAR(100),
            row_order INTEGER DEFAULT 0,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );`,
        `CREATE INDEX IF NOT EXISTS idx_sq_q8b_response_id ON sq_q8b_process_consumables (response_id);`,

        // Q11: fuels / energy carriers
        `CREATE TABLE IF NOT EXISTS sq_q11_fuels (
            id VARCHAR(255) PRIMARY KEY,
            response_id VARCHAR(255) NOT NULL,
            fuel_carrier TEXT,
            quantity DOUBLE PRECISION,
            unit VARCHAR(32),
            biogenic_y_n BOOLEAN,
            row_order INTEGER DEFAULT 0,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );`,
        `CREATE INDEX IF NOT EXISTS idx_sq_q11_response_id ON sq_q11_fuels (response_id);`,

        // Q12: direct process gases
        `CREATE TABLE IF NOT EXISTS sq_q12_process_gases (
            id VARCHAR(255) PRIMARY KEY,
            response_id VARCHAR(255) NOT NULL,
            direct_process_gas TEXT,
            quantity DOUBLE PRECISION,
            unit VARCHAR(32),
            fossil_or_biogenic VARCHAR(16),
            row_order INTEGER DEFAULT 0,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );`,
        `CREATE INDEX IF NOT EXISTS idx_sq_q12_response_id ON sq_q12_process_gases (response_id);`,

        // Q13: QC / IT energy
        `CREATE TABLE IF NOT EXISTS sq_q13_qc_it_energy (
            id VARCHAR(255) PRIMARY KEY,
            response_id VARCHAR(255) NOT NULL,
            item TEXT,
            value DOUBLE PRECISION,
            unit VARCHAR(32),
            already_in_q10 BOOLEAN DEFAULT FALSE,
            row_order INTEGER DEFAULT 0,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );`,
        `CREATE INDEX IF NOT EXISTS idx_sq_q13_response_id ON sq_q13_qc_it_energy (response_id);`,

        // Q14: production / QC waste
        `CREATE TABLE IF NOT EXISTS sq_q14_production_waste (
            id VARCHAR(255) PRIMARY KEY,
            response_id VARCHAR(255) NOT NULL,
            product_id_or_mpn TEXT,
            component_name TEXT,
            waste_type TEXT,
            treatment_type TEXT,
            quantity DOUBLE PRECISION,
            unit VARCHAR(32),
            energy_recovered BOOLEAN,
            polluter_pays_applied BOOLEAN,
            row_order INTEGER DEFAULT 0,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );`,
        `CREATE INDEX IF NOT EXISTS idx_sq_q14_response_id ON sq_q14_production_waste (response_id);`,

        // Q16: packaging materials
        `CREATE TABLE IF NOT EXISTS sq_q16_packaging_materials (
            id VARCHAR(255) PRIMARY KEY,
            response_id VARCHAR(255) NOT NULL,
            product_id_or_mpn TEXT,
            component_name TEXT,
            packaging_type TEXT,
            process_type TEXT,
            packaging_weight DOUBLE PRECISION,
            unit VARCHAR(32),
            region TEXT,
            country VARCHAR(8),
            recycled_pct DOUBLE PRECISION,
            carbon_biogenic_pct DOUBLE PRECISION,
            row_order INTEGER DEFAULT 0,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );`,
        `CREATE INDEX IF NOT EXISTS idx_sq_q16_response_id ON sq_q16_packaging_materials (response_id);`,

        // Q16a: packaging transport
        `CREATE TABLE IF NOT EXISTS sq_q16a_packaging_transport (
            id VARCHAR(255) PRIMARY KEY,
            response_id VARCHAR(255) NOT NULL,
            packaging_product_id_or_mpn TEXT,
            component_name TEXT,
            transport_mode TEXT,
            weight DOUBLE PRECISION,
            unit VARCHAR(32),
            distance_km DOUBLE PRECISION,
            row_order INTEGER DEFAULT 0,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );`,
        `CREATE INDEX IF NOT EXISTS idx_sq_q16a_response_id ON sq_q16a_packaging_transport (response_id);`,

        // Q17: packaging waste
        `CREATE TABLE IF NOT EXISTS sq_q17_packaging_waste (
            id VARCHAR(255) PRIMARY KEY,
            response_id VARCHAR(255) NOT NULL,
            mpn_code TEXT,
            component_name TEXT,
            packaging_waste_type TEXT,
            treatment_type TEXT,
            quantity DOUBLE PRECISION,
            unit VARCHAR(32),
            energy_recovered BOOLEAN,
            row_order INTEGER DEFAULT 0,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );`,
        `CREATE INDEX IF NOT EXISTS idx_sq_q17_response_id ON sq_q17_packaging_waste (response_id);`,

        // Q19: distribution transport legs
        `CREATE TABLE IF NOT EXISTS sq_q19_transport_legs (
            id VARCHAR(255) PRIMARY KEY,
            response_id VARCHAR(255) NOT NULL,
            product_id_or_mpn TEXT,
            component_name TEXT,
            transport_mode TEXT,
            source TEXT,
            destination TEXT,
            weight DOUBLE PRECISION,
            unit VARCHAR(32),
            distance_km DOUBLE PRECISION,
            low_carbon_fuel BOOLEAN,
            fuel_certificate_ref TEXT,
            row_order INTEGER DEFAULT 0,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );`,
        `CREATE INDEX IF NOT EXISTS idx_sq_q19_response_id ON sq_q19_transport_legs (response_id);`,

        // Q20: biomass feedstock (multi-row part; flat fields live on main response)
        `CREATE TABLE IF NOT EXISTS sq_q20_biomass_feedstock (
            id VARCHAR(255) PRIMARY KEY,
            response_id VARCHAR(255) NOT NULL,
            biomass_feedstock_type TEXT,
            quantity DOUBLE PRECISION,
            unit VARCHAR(32),
            biogenic_carbon_content_pct DOUBLE PRECISION,
            row_order INTEGER DEFAULT 0,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );`,
        `CREATE INDEX IF NOT EXISTS idx_sq_q20_response_id ON sq_q20_biomass_feedstock (response_id);`,

        // ============================================================
        // Config + audit tables for EF matching engine and formula engine
        // ============================================================

        // IPCC GWP characterization factors (AR4/AR5/AR6 ... CH4/N2O/...)
        // Seeded by a separate seeder when admin first runs the app.
        `CREATE TABLE IF NOT EXISTS gwp_factors (
            id VARCHAR(255) PRIMARY KEY,
            ipcc_version VARCHAR(16) NOT NULL,
            gas VARCHAR(32) NOT NULL,
            gwp_100y DOUBLE PRECISION NOT NULL,
            gwp_20y DOUBLE PRECISION,
            source TEXT,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(ipcc_version, gas)
        );`,
        `CREATE INDEX IF NOT EXISTS idx_gwp_factors_version ON gwp_factors (ipcc_version);`,

        // EF scoring weights per activity type (material, packaging, transport, waste, energy, fuels, gases).
        // criterion examples: material, process, geography, year, unit, recycled.
        // scoring_rules_json carries graded match rules (exact / region / GLO / RoW etc.).
        `CREATE TABLE IF NOT EXISTS ef_scoring_config (
            id VARCHAR(255) PRIMARY KEY,
            activity_type VARCHAR(64) NOT NULL,
            criterion VARCHAR(64) NOT NULL,
            weight INTEGER NOT NULL,
            scoring_rules_json JSONB,
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(activity_type, criterion)
        );`,
        `CREATE INDEX IF NOT EXISTS idx_ef_scoring_config_activity
            ON ef_scoring_config (activity_type);`,

        // EF match audit — every EF pick logged (ISO 14067 / Catena-X audit trail).
        `CREATE TABLE IF NOT EXISTS ef_match_audit (
            id VARCHAR(255) PRIMARY KEY,
            response_id VARCHAR(255) NOT NULL,
            source_question VARCHAR(64) NOT NULL,
            source_row_id VARCHAR(255),
            activity_type VARCHAR(64) NOT NULL,
            input_payload_json JSONB,
            winning_ef_id TEXT,
            winning_score DOUBLE PRECISION,
            confidence_band VARCHAR(16),
            alternatives_json JSONB,
            scoring_config_version INTEGER DEFAULT 1,
            matched_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );`,
        `CREATE INDEX IF NOT EXISTS idx_ef_match_audit_response
            ON ef_match_audit (response_id);`,
        `CREATE INDEX IF NOT EXISTS idx_ef_match_audit_question
            ON ef_match_audit (source_question);`,

        // PCF computed field — every calculated v9 field stored for replay/audit.
        // field_path e.g. "productionStage.fossilGhgEmissions" or "carbonContent.biogenicCarbonContent".
        `CREATE TABLE IF NOT EXISTS pcf_computed_field (
            id VARCHAR(255) PRIMARY KEY,
            response_id VARCHAR(255) NOT NULL,
            field_path TEXT NOT NULL,
            value DOUBLE PRECISION,
            formula_used TEXT,
            inputs_json JSONB,
            computed_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );`,
        `CREATE INDEX IF NOT EXISTS idx_pcf_computed_field_response
            ON pcf_computed_field (response_id);`,
        `CREATE INDEX IF NOT EXISTS idx_pcf_computed_field_path
            ON pcf_computed_field (field_path);`,

        // DQR V3 rating — one row per rated emission line of the new 28-Q
        // questionnaire. Replaces the 50 legacy per-question dqr_* tables, which
        // the V3 questionnaire cannot populate. Keyed by (response_id, source_row_id)
        // so each emission line (sq_q8_bom / sq_q10_electricity / sq_q12 / sq_q14 /
        // sq_q16 / sq_q17 / sq_q19 row) maps to exactly one DQR data point. Holds
        // the same five-dimension tag model (TeR/TiR/GR/C/PDS) the page already uses.
        `CREATE TABLE IF NOT EXISTS dqr_v3_rating (
            id VARCHAR(255) PRIMARY KEY,
            response_id VARCHAR(255) NOT NULL,
            source_question VARCHAR(32) NOT NULL,
            source_row_id VARCHAR(255) NOT NULL,
            sgiq_id VARCHAR(255),
            data TEXT,
            ter_tag_type VARCHAR(255),
            ter_tag_value VARCHAR(255),
            ter_data_point VARCHAR(255),
            tir_tag_type VARCHAR(255),
            tir_tag_value VARCHAR(255),
            tir_data_point VARCHAR(255),
            gr_tag_type VARCHAR(255),
            gr_tag_value VARCHAR(255),
            gr_data_point VARCHAR(255),
            c_tag_type VARCHAR(255),
            c_tag_value VARCHAR(255),
            c_data_point VARCHAR(255),
            pds_tag_type VARCHAR(255),
            pds_tag_value VARCHAR(255),
            pds_data_point VARCHAR(255),
            created_by VARCHAR(255),
            updated_by VARCHAR(255),
            created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            update_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT uq_dqr_v3_rating_line UNIQUE (response_id, source_row_id)
        );`,
        `CREATE INDEX IF NOT EXISTS idx_dqr_v3_rating_response
            ON dqr_v3_rating (response_id);`,

        // ============================================================
        // Seed: GWP characterization factors (IPCC AR4 / AR5 / AR6, 100-year)
        // Sources: IPCC AR4 WG1 Ch.2 (2007), AR5 WG1 Ch.8 (2013), AR6 WG1 Ch.7 (2021).
        // CO2 is always 1 (reference gas). CH4 / N2O are the two we use in our formulas.
        // SF6, NF3, HFCs included for completeness — useful if process gases (Q12) reports them.
        // ============================================================
        `INSERT INTO gwp_factors (id, ipcc_version, gas, gwp_100y, gwp_20y, source) VALUES
            ('gwp_ar4_co2',  'AR4', 'CO2',  1,    1,    'IPCC AR4 WG1 (2007)'),
            ('gwp_ar4_ch4',  'AR4', 'CH4',  25,   72,   'IPCC AR4 WG1 (2007)'),
            ('gwp_ar4_n2o',  'AR4', 'N2O',  298,  289,  'IPCC AR4 WG1 (2007)'),
            ('gwp_ar4_sf6',  'AR4', 'SF6',  22800,16300,'IPCC AR4 WG1 (2007)'),
            ('gwp_ar5_co2',  'AR5', 'CO2',  1,    1,    'IPCC AR5 WG1 (2013), no feedbacks'),
            ('gwp_ar5_ch4',  'AR5', 'CH4',  28,   84,   'IPCC AR5 WG1 (2013), no feedbacks'),
            ('gwp_ar5_n2o',  'AR5', 'N2O',  265,  264,  'IPCC AR5 WG1 (2013), no feedbacks'),
            ('gwp_ar5_sf6',  'AR5', 'SF6',  23500,17500,'IPCC AR5 WG1 (2013)'),
            ('gwp_ar5_nf3',  'AR5', 'NF3',  16100,12800,'IPCC AR5 WG1 (2013)'),
            ('gwp_ar6_co2',  'AR6', 'CO2',  1,    1,    'IPCC AR6 WG1 Ch.7 (2021)'),
            ('gwp_ar6_ch4',  'AR6', 'CH4',  27.9, 82.5, 'IPCC AR6 WG1 Ch.7 (2021), non-fossil 27.0 / fossil 29.8 averaged'),
            ('gwp_ar6_n2o',  'AR6', 'N2O',  273,  273,  'IPCC AR6 WG1 Ch.7 (2021)'),
            ('gwp_ar6_sf6',  'AR6', 'SF6',  25200,18300,'IPCC AR6 WG1 Ch.7 (2021)'),
            ('gwp_ar6_nf3',  'AR6', 'NF3',  17400,13400,'IPCC AR6 WG1 Ch.7 (2021)')
         ON CONFLICT (ipcc_version, gas) DO NOTHING;`,

        // ============================================================
        // Seed: EF scoring weights — MATERIAL activity type.
        // Other activity types (packaging / energy / fuels / transport / waste / gases)
        // will be seeded when team confirms their weights.
        // ============================================================
        `INSERT INTO ef_scoring_config (id, activity_type, criterion, weight, scoring_rules_json) VALUES
            ('efsc_material_material',  'material', 'material',  40,
                '{"exact": 40, "same_family": 25, "different": 0}'::jsonb),
            ('efsc_material_process',   'material', 'process',   30,
                '{"exact": 30, "related": 15, "different": 5, "missing": 0}'::jsonb),
            ('efsc_material_geography', 'material', 'geography', 15,
                '{"same_country": 15, "same_region": 10, "GLO": 5, "RoW": 2}'::jsonb),
            ('efsc_material_unit',      'material', 'unit',      10,
                '{"exact_unit": 10, "same_unit_family_convertible": 7, "different_family": 0}'::jsonb),
            ('efsc_material_year',      'material', 'year',      5,
                '{"exact_year": 5, "within_1y": 4, "within_3y": 2, "older": 0}'::jsonb)
         ON CONFLICT (activity_type, criterion) DO NOTHING;`,

        // ============================================================
        // Seed: EF scoring weights — the remaining 6 activity types.
        // Same criteria/weights as material (40/30/15/10/5). Matchers map onto
        // the real BAFU columns (product/category/sub_category_1/sub_category_2,
        // country_code/country_name, unit, reference_year). Tune per-type later.
        // ============================================================
        `INSERT INTO ef_scoring_config (id, activity_type, criterion, weight, scoring_rules_json) VALUES
            ('efsc_packaging_material',  'packaging', 'material',  40, '{"exact": 40, "same_family": 25, "different": 0}'::jsonb),
            ('efsc_packaging_process',   'packaging', 'process',   30, '{"exact": 30, "related": 15, "different": 5, "missing": 0}'::jsonb),
            ('efsc_packaging_geography', 'packaging', 'geography', 15, '{"same_country": 15, "same_region": 10, "GLO": 5, "RoW": 2}'::jsonb),
            ('efsc_packaging_unit',      'packaging', 'unit',      10, '{"exact_unit": 10, "different_family": 0}'::jsonb),
            ('efsc_packaging_year',      'packaging', 'year',      5,  '{"exact_year": 5, "within_1y": 4, "within_3y": 2, "older": 0}'::jsonb),

            ('efsc_transport_material',  'transport', 'material',  40, '{"exact": 40, "same_family": 25, "different": 0}'::jsonb),
            ('efsc_transport_process',   'transport', 'process',   30, '{"exact": 30, "related": 15, "different": 5, "missing": 0}'::jsonb),
            ('efsc_transport_geography', 'transport', 'geography', 15, '{"same_country": 15, "same_region": 10, "GLO": 5, "RoW": 2}'::jsonb),
            ('efsc_transport_unit',      'transport', 'unit',      10, '{"exact_unit": 10, "different_family": 0}'::jsonb),
            ('efsc_transport_year',      'transport', 'year',      5,  '{"exact_year": 5, "within_1y": 4, "within_3y": 2, "older": 0}'::jsonb),

            ('efsc_waste_material',      'waste', 'material',  40, '{"exact": 40, "same_family": 25, "different": 0}'::jsonb),
            ('efsc_waste_process',       'waste', 'process',   30, '{"exact": 30, "related": 15, "different": 5, "missing": 0}'::jsonb),
            ('efsc_waste_geography',     'waste', 'geography', 15, '{"same_country": 15, "same_region": 10, "GLO": 5, "RoW": 2}'::jsonb),
            ('efsc_waste_unit',          'waste', 'unit',      10, '{"exact_unit": 10, "different_family": 0}'::jsonb),
            ('efsc_waste_year',          'waste', 'year',      5,  '{"exact_year": 5, "within_1y": 4, "within_3y": 2, "older": 0}'::jsonb),

            ('efsc_energy_material',     'energy', 'material',  40, '{"exact": 40, "same_family": 25, "different": 0}'::jsonb),
            ('efsc_energy_process',      'energy', 'process',   30, '{"exact": 30, "related": 15, "different": 5, "missing": 0}'::jsonb),
            ('efsc_energy_geography',    'energy', 'geography', 15, '{"same_country": 15, "same_region": 10, "GLO": 5, "RoW": 2}'::jsonb),
            ('efsc_energy_unit',         'energy', 'unit',      10, '{"exact_unit": 10, "different_family": 0}'::jsonb),
            ('efsc_energy_year',         'energy', 'year',      5,  '{"exact_year": 5, "within_1y": 4, "within_3y": 2, "older": 0}'::jsonb),

            ('efsc_fuels_material',      'fuels', 'material',  40, '{"exact": 40, "same_family": 25, "different": 0}'::jsonb),
            ('efsc_fuels_process',       'fuels', 'process',   30, '{"exact": 30, "related": 15, "different": 5, "missing": 0}'::jsonb),
            ('efsc_fuels_geography',     'fuels', 'geography', 15, '{"same_country": 15, "same_region": 10, "GLO": 5, "RoW": 2}'::jsonb),
            ('efsc_fuels_unit',          'fuels', 'unit',      10, '{"exact_unit": 10, "different_family": 0}'::jsonb),
            ('efsc_fuels_year',          'fuels', 'year',      5,  '{"exact_year": 5, "within_1y": 4, "within_3y": 2, "older": 0}'::jsonb),

            ('efsc_gas_material',        'process_gas', 'material',  40, '{"exact": 40, "same_family": 25, "different": 0}'::jsonb),
            ('efsc_gas_process',         'process_gas', 'process',   30, '{"exact": 30, "related": 15, "different": 5, "missing": 0}'::jsonb),
            ('efsc_gas_geography',       'process_gas', 'geography', 15, '{"same_country": 15, "same_region": 10, "GLO": 5, "RoW": 2}'::jsonb),
            ('efsc_gas_unit',            'process_gas', 'unit',      10, '{"exact_unit": 10, "different_family": 0}'::jsonb),
            ('efsc_gas_year',            'process_gas', 'year',      5,  '{"exact_year": 5, "within_1y": 4, "within_3y": 2, "older": 0}'::jsonb)
         ON CONFLICT (activity_type, criterion) DO NOTHING;`,

    ]

    // try {
    //     var queryGlobal
    //     for (const query of createTableQueries) {
    //         queryGlobal = query
    //         const tables = await client.query(query);
    //     }

    //     console.log("Tables created successfully");
    // } catch (error) {
    //     console.error("Error creating tables:", error, queryGlobal);
    // }

    return withClient(async (client: any) => {
        try {
            for (const query of createTableQueries) {
                try {
                    await client.query(query);
                } catch (queryError: any) {
                    // Log individual query errors but continue
                    console.error("Error executing query:", queryError.message);
                    console.error("Query:", query.substring(0, 100) + "...");
                }
            }

            console.log("Tables created successfully");
        } catch (error) {
            console.error("Error creating tables:", error);
        }
    })
}