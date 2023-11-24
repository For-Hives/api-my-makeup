import type { Schema, Attribute } from '@strapi/strapi';

export interface MakeupartistsCourses extends Schema.Component {
  collectionName: 'components_makeupartists_courses';
  info: {
    displayName: 'Courses';
    description: '';
  };
  attributes: {
    diploma: Attribute.String &
      Attribute.SetMinMaxLength<{
        maxLength: 70;
      }>;
    school: Attribute.String &
      Attribute.SetMinMaxLength<{
        maxLength: 70;
      }>;
    date_graduation: Attribute.Date;
    course_description: Attribute.Text &
      Attribute.SetMinMaxLength<{
        maxLength: 2000;
      }>;
  };
}

export interface MakeupartistsExperiences extends Schema.Component {
  collectionName: 'components_makeupartists_experiences';
  info: {
    displayName: 'Experiences';
    description: '';
  };
  attributes: {
    company: Attribute.String &
      Attribute.SetMinMaxLength<{
        maxLength: 70;
      }>;
    job_name: Attribute.String &
      Attribute.SetMinMaxLength<{
        maxLength: 70;
      }>;
    city: Attribute.String &
      Attribute.SetMinMaxLength<{
        maxLength: 70;
      }>;
    date_start: Attribute.Date;
    date_end: Attribute.Date;
    description: Attribute.Text &
      Attribute.SetMinMaxLength<{
        maxLength: 2000;
      }>;
  };
}

export interface MakeupartistsLanguage extends Schema.Component {
  collectionName: 'components_makeupartists_languages';
  info: {
    displayName: 'language';
    description: '';
  };
  attributes: {
    name: Attribute.String &
      Attribute.SetMinMaxLength<{
        maxLength: 70;
      }>;
  };
}

export interface MakeupartistsNetwork extends Schema.Component {
  collectionName: 'components_makeupartists_networks';
  info: {
    displayName: 'network';
    description: '';
  };
  attributes: {
    youtube: Attribute.String &
      Attribute.SetMinMaxLength<{
        maxLength: 200;
      }>;
    facebook: Attribute.String &
      Attribute.SetMinMaxLength<{
        maxLength: 200;
      }>;
    instagram: Attribute.String &
      Attribute.SetMinMaxLength<{
        maxLength: 200;
      }>;
    website: Attribute.String &
      Attribute.SetMinMaxLength<{
        maxLength: 200;
      }>;
    linkedin: Attribute.String &
      Attribute.SetMinMaxLength<{
        maxLength: 200;
      }>;
    phone: Attribute.String &
      Attribute.SetMinMaxLength<{
        maxLength: 20;
      }>;
    email: Attribute.String &
      Attribute.SetMinMaxLength<{
        maxLength: 200;
      }>;
  };
}

export interface MakeupartistsServiceOffers extends Schema.Component {
  collectionName: 'components_makeupartists_service_offers';
  info: {
    displayName: 'service_offers';
    description: '';
  };
  attributes: {
    name: Attribute.String &
      Attribute.SetMinMaxLength<{
        maxLength: 70;
      }>;
    description: Attribute.Text;
    options: Attribute.Component<'service-offers.options', true>;
    price: Attribute.Text &
      Attribute.SetMinMaxLength<{
        maxLength: 70;
      }>;
  };
}

export interface MakeupartistsSkills extends Schema.Component {
  collectionName: 'components_makeupartists_skills';
  info: {
    displayName: 'skills';
    description: '';
  };
  attributes: {
    name: Attribute.String &
      Attribute.SetMinMaxLength<{
        maxLength: 70;
      }>;
    description: Attribute.Text &
      Attribute.SetMinMaxLength<{
        maxLength: 2000;
      }>;
  };
}

export interface ServiceOffersOptions extends Schema.Component {
  collectionName: 'components_service_offers_options';
  info: {
    displayName: 'options';
    description: '';
  };
  attributes: {
    name: Attribute.String;
    description: Attribute.Text &
      Attribute.SetMinMaxLength<{
        maxLength: 2000;
      }>;
    price: Attribute.Text &
      Attribute.SetMinMaxLength<{
        maxLength: 70;
      }>;
  };
}

declare module '@strapi/types' {
  export module Shared {
    export interface Components {
      'makeupartists.courses': MakeupartistsCourses;
      'makeupartists.experiences': MakeupartistsExperiences;
      'makeupartists.language': MakeupartistsLanguage;
      'makeupartists.network': MakeupartistsNetwork;
      'makeupartists.service-offers': MakeupartistsServiceOffers;
      'makeupartists.skills': MakeupartistsSkills;
      'service-offers.options': ServiceOffersOptions;
    }
  }
}
